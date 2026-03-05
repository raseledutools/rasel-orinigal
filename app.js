// --- ১. কনফিগারেশন ---
const APP_ID = "3581d419edb9484eb108db498e6bcdcf"; 
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
let screenTrack = null;
let currentRoom = null;
let userName = "Rasel Mia"; 
const myUserId = Math.floor(Math.random() * 100000).toString(); 
let myAgoraUid = null;
let unreadCount = 0;

let isMuted = false;
let isVidOff = false;
let isSharingScreen = false;

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    document.getElementById('direct-visit-ui').style.display = 'none';
    document.getElementById('join-link-ui').style.display = 'block';
}

// --- ৩. পেজ লোড (অডিও নয়েজ ফিক্স) ---
window.onload = async () => {
    try {
        // AEC (Echo Cancellation), ANS (Noise Suppression), AGC (Auto Gain) যুক্ত করা হলো
        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            { AEC: true, ANS: true, AGC: true, encoderConfig: "high_quality" }, 
            { encoderConfig: "720p_1" }
        );
        localTracks.videoTrack.play('pre-join-player');
    } catch (error) {
        alert("ক্যামেরা/মাইক পারমিশন দিন!");
    }
};

// --- ৪. গ্রিড আপডেট লজিক ---
function updateGridCount() {
    const grid = document.getElementById('video-grid');
    const count = grid.querySelectorAll('.video-box').length;
    grid.setAttribute('data-users', count);
}

// --- ৫. প্রি-জয়েন কন্ট্রোল ---
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
        btn.innerHTML = `<i class="fas ${iconBase}-slash"></i>${textOn ? `<span>${textOn}</span>` : ''}`;
    } else {
        btn.classList.remove('active-off');
        btn.innerHTML = `<i class="fas ${iconBase}"></i>${textOff ? `<span>${textOff}</span>` : ''}`;
    }
}

// --- ৬. মিটিং জয়েন ---
document.getElementById('createRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value.trim() || userName;
    currentRoom = Math.floor(100000 + Math.random() * 900000).toString();
    startMeeting(currentRoom);
};

document.getElementById('joinRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value.trim() || userName;
    const rm = document.getElementById('roomInput').value.trim();
    if (rm.length === 6) startMeeting(rm); else alert("৬ ডিজিটের আইডি দিন!");
};

document.getElementById('joinFromLinkBtn').onclick = () => {
    userName = document.getElementById('userNameLink').value.trim() || userName;
    startMeeting(roomFromUrl);
};

async function startMeeting(roomId) {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-meeting').style.display = 'flex';
    document.getElementById('displayRoomId').innerText = roomId;
    document.getElementById('my-name-badge').innerText = userName + " (You)";

    localTracks.videoTrack.play('local-player');
    document.getElementById('local-box').setAttribute('data-uid', 'local');

    updateBtnUI(document.getElementById('toggleMic'), isMuted, 'fa-microphone');
    updateBtnUI(document.getElementById('toggleCam'), isVidOff, 'fa-video');

    try {
        // Agora জয়েন করা
        myAgoraUid = await client.join(APP_ID, roomId, null, null);
        document.getElementById('local-box').id = `user-${myAgoraUid}`; // বক্সের আইডি চেঞ্জ করা
        
        await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
        
        // রুমের ডাটাবেজ তৈরি
        await db.collection('rooms').doc(roomId).set({ active: true }, { merge: true });
        
        listenForChats(roomId);
        listenForScreenShareState(roomId);
    } catch (e) {
        alert("কানেকশন ফেইল!");
    }

    client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
            let remoteBox = document.getElementById(`user-${user.uid}`);
            if (!remoteBox) {
                remoteBox = document.createElement("div");
                remoteBox.id = `user-${user.uid}`;
                remoteBox.className = "video-box";
                remoteBox.innerHTML = `<span class="name-badge">Participant</span>`;
                document.getElementById('video-grid').appendChild(remoteBox);
            }
            user.videoTrack.play(remoteBox.id);
            updateGridCount();
        }
        if (mediaType === "audio") user.audioTrack.play();
    });

    client.on("user-left", (user) => {
        document.getElementById(`user-${user.uid}`)?.remove();
        updateGridCount();
    });
}

// --- ৭. স্মার্ট স্ক্রিন শেয়ার (শুধু একজন পারবে) ---
const shareBtn = document.getElementById('shareScreenBtn');

shareBtn.onclick = async () => {
    if (!isSharingScreen) {
        try {
            const screenTrackRes = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" });
            screenTrack = Array.isArray(screenTrackRes) ? screenTrackRes[0] : screenTrackRes;

            await client.unpublish(localTracks.videoTrack);
            await client.publish(screenTrack);
            screenTrack.play(`user-${myAgoraUid}`);
            
            isSharingScreen = true;
            shareBtn.classList.add('active-off');

            // ফায়ারবেসে স্ট্যাটাস আপডেট (আমি শেয়ার করছি)
            await db.collection('rooms').doc(currentRoom).update({ screenSharer: myAgoraUid });

            screenTrack.on("track-ended", stopSharing);
        } catch (err) { console.error(err); }
    } else {
        stopSharing();
    }
};

async function stopSharing() {
    if (screenTrack) {
        await client.unpublish(screenTrack);
        screenTrack.close();
        screenTrack = null;
    }
    await client.publish(localTracks.videoTrack);
    localTracks.videoTrack.play(`user-${myAgoraUid}`);
    
    isSharingScreen = false;
    shareBtn.classList.remove('active-off');
    
    // ফায়ারবেসে স্ট্যাটাস আপডেট (শেয়ার বন্ধ)
    await db.collection('rooms').doc(currentRoom).update({ screenSharer: null });
}

// ফায়ারবেস থেকে স্ক্রিন শেয়ারের স্ট্যাটাস শোনা
function listenForScreenShareState(roomId) {
    db.collection('rooms').doc(roomId).onSnapshot(doc => {
        const data = doc.data();
        const grid = document.getElementById('video-grid');
        
        // আগে সবার কাছ থেকে ফুল-স্ক্রিন ক্লাস সরিয়ে নিচ্ছি
        document.querySelectorAll('.video-box').forEach(box => box.classList.remove('screen-active'));

        if (data && data.screenSharer) {
            grid.classList.add('sharing-active');
            
            // যে শেয়ার করছে তার বক্স বড় করা
            const activeBox = document.getElementById(`user-${data.screenSharer}`);
            if (activeBox) activeBox.classList.add('screen-active');
            
            // অন্য কেউ শেয়ার করলে আমার শেয়ার বাটন ডিজেবল করা
            if (data.screenSharer !== myAgoraUid) {
                shareBtn.disabled = true;
                shareBtn.style.opacity = '0.5';
            }
        } else {
            grid.classList.remove('sharing-active');
            shareBtn.disabled = false;
            shareBtn.style.opacity = '1';
        }
    });
}

// --- ৮. অন্যান্য কন্ট্রোল ---
document.getElementById('toggleMic').onclick = async (e) => {
    isMuted = !isMuted; await localTracks.audioTrack.setMuted(isMuted);
    updateBtnUI(e.currentTarget, isMuted, 'fa-microphone');
};
document.getElementById('toggleCam').onclick = async (e) => {
    isVidOff = !isVidOff; await localTracks.videoTrack.setMuted(isVidOff);
    updateBtnUI(e.currentTarget, isVidOff, 'fa-video');
};

document.getElementById('inviteBtn').onclick = () => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${currentRoom}`).then(() => alert("লিংক কপি হয়েছে!"));

document.getElementById('toggleChat').onclick = () => {
    const sb = document.getElementById('chatSidebar');
    sb.style.display = (sb.style.display === 'none' || !sb.style.display) ? 'flex' : 'none';
    if (sb.style.display === 'flex') { unreadCount = 0; document.getElementById('chatBadge').style.display = 'none'; }
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
        if(isSharingScreen) await stopSharing();
        localTracks.audioTrack?.close(); localTracks.videoTrack?.close();
        await client.leave();
        window.location.href = window.location.pathname;
    }
};
