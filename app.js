// --- ১. কনফিগারেশন ---
const APP_ID = "3581d419edb9484eb108db498e6bcdcf"; // <--- অবশ্যই পরিবর্তন করবেন
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

const firebaseConfig = {
    apiKey: "AIzaSyDGd3KAo45UuqmeGFALziz_oKm3htEASHY",
    authDomain: "mywebtools-f8d53.firebaseapp.com",
    projectId: "mywebtools-f8d53"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- ২. গ্লোবাল ভ্যারিয়েবল ---
let localTracks = { videoTrack: null, audioTrack: null };
let currentRoom = null;
let userName = "Guest"; 
const myUserId = Math.floor(Math.random() * 10000).toString(); 
let unreadCount = 0;

let isMuted = false;
let isVidOff = false;

// URL লজিক
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    document.getElementById('direct-visit-ui').style.display = 'none';
    document.getElementById('join-link-ui').style.display = 'block';
}

// --- ৩. পেজ লোড হলে প্রিভিউ চালু ---
window.onload = async () => {
    try {
        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            { AEC: true, ANS: true }, { encoderConfig: "720p_1" }
        );
        localTracks.videoTrack.play('pre-join-player');
    } catch (error) {
        alert("ক্যামেরা/মাইক পারমিশন দিন!");
    }
};

// --- ৪. প্রি-জয়েন বাটন লজিক ---
const preMicBtn = document.getElementById('preMicBtn');
const preCamBtn = document.getElementById('preCamBtn');

preMicBtn.onclick = async () => {
    isMuted = !isMuted;
    await localTracks.audioTrack.setMuted(isMuted);
    updateBtnUI(preMicBtn, isMuted, 'fa-microphone', 'Mute', 'Unmute');
};

preCamBtn.onclick = async () => {
    isVidOff = !isVidOff;
    await localTracks.videoTrack.setMuted(isVidOff);
    updateBtnUI(preCamBtn, isVidOff, 'fa-video', 'Stop Video', 'Start Video');
};

function updateBtnUI(btn, isOff, iconBase, textOff, textOn) {
    if (isOff) {
        btn.classList.add('active-off');
        btn.innerHTML = `<i class="fas ${iconBase}-slash"></i><span>${textOn || ''}</span>`;
    } else {
        btn.classList.remove('active-off');
        btn.innerHTML = `<i class="fas ${iconBase}"></i><span>${textOff || ''}</span>`;
    }
}

// --- ৫. মিটিং জয়েন লজিক ---
document.getElementById('createRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value.trim() || "Host";
    currentRoom = Math.floor(100000 + Math.random() * 900000).toString();
    startMeeting(currentRoom);
};

document.getElementById('joinRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value.trim() || "Participant";
    const rm = document.getElementById('roomInput').value.trim();
    if (rm.length === 6) startMeeting(rm); else alert("৬ ডিজিটের আইডি দিন!");
};

document.getElementById('joinFromLinkBtn').onclick = () => {
    userName = document.getElementById('userNameLink').value.trim() || "Participant";
    startMeeting(roomFromUrl);
};

async function startMeeting(roomId) {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-meeting').style.display = 'flex';
    document.getElementById('displayRoomId').innerText = roomId;
    document.getElementById('my-name-badge').innerText = userName + " (You)";

    localTracks.videoTrack.play('local-player');

    // ভেতরের বাটন আপডেট
    updateBtnUI(document.getElementById('toggleMic'), isMuted, 'fa-microphone');
    updateBtnUI(document.getElementById('toggleCam'), isVidOff, 'fa-video');

    try {
        await client.join(APP_ID, roomId, null, null);
        await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
        listenForChats(roomId);
    } catch (e) {
        console.error(e);
        alert("কানেকশন ফেইল! Agora App ID কি Testing Mode-এ আছে?");
    }

    client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
            let remoteBox = document.getElementById(`user-${user.uid}`);
            if (!remoteBox) {
                remoteBox = document.createElement("div");
                remoteBox.id = `user-${user.uid}`;
                remoteBox.className = "video-box";
                // নামের ব্যাজ অ্যাড করা যায় এখানে, তবে আপাতত ID দেখাচ্ছি
                remoteBox.innerHTML = `<span class="name-badge">User-${user.uid.toString().slice(-4)}</span>`;
                document.getElementById('video-grid').appendChild(remoteBox);
            }
            user.videoTrack.play(remoteBox.id);
        }
        if (mediaType === "audio") user.audioTrack.play();
    });

    client.on("user-left", (user) => document.getElementById(`user-${user.uid}`)?.remove());
}

// --- ৬. মিটিংয়ের ভেতরের কন্ট্রোল ---
const toggleMic = document.getElementById('toggleMic');
const toggleCam = document.getElementById('toggleCam');

toggleMic.onclick = async () => {
    isMuted = !isMuted;
    await localTracks.audioTrack.setMuted(isMuted);
    updateBtnUI(toggleMic, isMuted, 'fa-microphone');
};

toggleCam.onclick = async () => {
    isVidOff = !isVidOff;
    await localTracks.videoTrack.setMuted(isVidOff);
    updateBtnUI(toggleCam, isVidOff, 'fa-video');
};

// চ্যাট ও লিভ
document.getElementById('inviteBtn').onclick = () => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${currentRoom}`).then(() => alert("লিংক কপি হয়েছে!"));

document.getElementById('toggleChat').onclick = () => {
    const sb = document.getElementById('chatSidebar');
    if (sb.style.display === 'none' || !sb.style.display) {
        sb.style.display = 'flex';
        unreadCount = 0; document.getElementById('chatBadge').style.display = 'none';
    } else sb.style.display = 'none';
};
document.getElementById('closeChatBtn').onclick = () => document.getElementById('chatSidebar').style.display = 'none';

document.getElementById('sendChatBtn').onclick = () => {
    const input = document.getElementById('chatInput');
    if (input.value.trim()) {
        db.collection('rooms').doc(currentRoom).collection('chats').add({ text: input.value, sender: myUserId, senderName: userName, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        input.value = "";
    }
};

function listenForChats(roomId) {
    db.collection('rooms').doc(roomId).collection('chats').orderBy('timestamp').onSnapshot(snap => {
        snap.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const isMyMsg = data.sender === myUserId;
                const nameStr = isMyMsg ? 'আপনি' : (data.senderName || 'অন্যজন');
                document.getElementById('chatMessages').innerHTML += `<div class="chat-message ${isMyMsg ? 'my-msg' : ''}"><b style="font-size: 10px; opacity: 0.7;">${nameStr}</b><br>${data.text}</div>`;
                document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
                if (!isMyMsg && document.getElementById('chatSidebar').style.display !== 'flex') {
                    unreadCount++; document.getElementById('chatBadge').innerText = unreadCount; document.getElementById('chatBadge').style.display = 'flex';
                }
            }
        });
    });
}

document.getElementById('leaveMeeting').onclick = async () => {
    if (confirm("মিটিং শেষ করতে চান?")) {
        localTracks.audioTrack?.close(); localTracks.videoTrack?.close();
        await client.leave();
        window.location.href = window.location.pathname;
    }
};
