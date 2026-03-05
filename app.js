// --- ১. কনফিগারেশন ---
const APP_ID = "e286b94ae5df4ae7a7359cc70e7e9b91"; // আপনার App ID
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
const myUserId = Math.floor(Math.random() * 10000).toString(); 
let unreadCount = 0;

// ডিভাইস স্ট্যাটাস (মিটিংয়ে জয়েন করার আগে)
let isMuted = false;
let isVidOff = false;

// --- ৩. পেজ লোড হলেই ক্যামেরা প্রিভিউ চালু করা ---
window.onload = async () => {
    try {
        const audioConfig = { AEC: true, ANS: true, encoderConfig: "high_quality" };
        const videoConfig = { 
            encoderConfig: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: 30 } 
        };

        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(audioConfig, videoConfig);
        
        // প্রি-জয়েন স্ক্রিনে ভিডিও প্লে করা
        localTracks.videoTrack.play('pre-join-player');
    } catch (error) {
        console.error("ক্যামেরা এরর:", error);
        alert("ক্যামেরা বা মাইক্রোফোনের পারমিশন দিন!");
    }
};

// --- ৪. প্রি-জয়েন স্ক্রিনের বাটন লজিক ---
const preMicBtn = document.getElementById('preMicBtn');
const preCamBtn = document.getElementById('preCamBtn');

preMicBtn.onclick = async () => {
    isMuted = !isMuted;
    await localTracks.audioTrack.setMuted(isMuted);
    updateButtonUI(preMicBtn, isMuted, 'fa-microphone');
};

preCamBtn.onclick = async () => {
    isVidOff = !isVidOff;
    await localTracks.videoTrack.setMuted(isVidOff);
    updateButtonUI(preCamBtn, isVidOff, 'fa-video');
};

// --- ৫. মিটিং তৈরি ও জয়েন ---
function generate6DigitID() { return Math.floor(100000 + Math.random() * 900000).toString(); }

document.getElementById('createRoomBtn').onclick = () => {
    currentRoom = generate6DigitID();
    startMeeting(currentRoom);
};

document.getElementById('joinRoomBtn').onclick = () => {
    currentRoom = document.getElementById('roomInput').value.trim();
    if (currentRoom.length === 6) startMeeting(currentRoom);
    else alert("সঠিক ৬ ডিজিটের আইডি দিন!");
};

async function startMeeting(roomId) {
    // স্ক্রিন পরিবর্তন করা (Pre-join மறைத்து Main Area দেখানো)
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-meeting').style.display = 'flex';
    document.getElementById('displayRoomId').innerText = roomId;

    // প্রি-জয়েন স্ক্রিন থেকে ভিডিও সরিয়ে মূল বক্সে আনা
    localTracks.videoTrack.play('local-player');

    // ভেতরের বাটনগুলোকে প্রি-জয়েন এর সিলেকশন অনুযায়ী আপডেট করা
    updateButtonUI(document.getElementById('toggleMic'), isMuted, 'fa-microphone');
    updateButtonUI(document.getElementById('toggleCam'), isVidOff, 'fa-video');

    try {
        await client.join(APP_ID, roomId, null, null);
        await client.enableDualStream();
        await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
        listenForChats(roomId);
    } catch (e) {
        console.error("জয়েন করতে সমস্যা:", e);
    }

    client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
            let remoteBox = document.getElementById(`user-${user.uid}`);
            if (!remoteBox) {
                remoteBox = document.createElement("div");
                remoteBox.id = `user-${user.uid}`;
                remoteBox.className = "video-box";
                document.getElementById('video-grid').appendChild(remoteBox);
            }
            user.videoTrack.play(remoteBox);
        }
        if (mediaType === "audio") user.audioTrack.play();
    });

    client.on("user-left", (user) => {
        document.getElementById(`user-${user.uid}`)?.remove();
    });
}

// --- ৬. মিটিংয়ের ভেতরের কন্ট্রোল বাটন ---
const inMeetingMicBtn = document.getElementById('toggleMic');
const inMeetingCamBtn = document.getElementById('toggleCam');

inMeetingMicBtn.onclick = async () => {
    isMuted = !isMuted;
    await localTracks.audioTrack.setMuted(isMuted);
    updateButtonUI(inMeetingMicBtn, isMuted, 'fa-microphone');
};

inMeetingCamBtn.onclick = async () => {
    isVidOff = !isVidOff;
    await localTracks.videoTrack.setMuted(isVidOff);
    updateButtonUI(inMeetingCamBtn, isVidOff, 'fa-video');
};

// বাটন UI আপডেট করার গ্লোবাল ফাংশন (যাতে কালার ও আইকন স্মুথলি চেঞ্জ হয়)
function updateButtonUI(buttonElement, isOff, baseIconClass) {
    if (isOff) {
        buttonElement.classList.add('active-off');
        buttonElement.innerHTML = `<i class="fas ${baseIconClass}-slash"></i>`;
    } else {
        buttonElement.classList.remove('active-off');
        buttonElement.innerHTML = `<i class="fas ${baseIconClass}"></i>`;
    }
}

// স্ক্রিন শেয়ার
let isSharingScreen = false;
document.getElementById('shareScreenBtn').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!isSharingScreen) {
        try {
            const screenTrackRes = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1", optimizationMode: "detail" });
            screenTrack = Array.isArray(screenTrackRes) ? screenTrackRes[0] : screenTrackRes;

            await client.unpublish(localTracks.videoTrack);
            await client.publish(screenTrack);
            screenTrack.play('local-player');
            
            btn.classList.add('active-off');
            isSharingScreen = true;
            screenTrack.on("track-ended", () => stopSharing(btn));
        } catch (err) { console.error("Screen share error", err); }
    } else stopSharing(btn);
};

async function stopSharing(btn) {
    if (screenTrack) {
        await client.unpublish(screenTrack);
        screenTrack.close();
        screenTrack = null;
    }
    await client.publish(localTracks.videoTrack);
    localTracks.videoTrack.play('local-player');
    btn.classList.remove('active-off');
    isSharingScreen = false;
}

// অন্যান্য কন্ট্রোলস
document.getElementById('inviteBtn').onclick = () => {
    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${currentRoom}`).then(() => alert("লিংক কপি হয়েছে!"));
};

const chatSidebar = document.getElementById('chatSidebar');
const chatBadge = document.getElementById('chatBadge');
const chatMessages = document.getElementById('chatMessages');

document.getElementById('toggleChat').onclick = () => {
    if (chatSidebar.style.display === 'none' || chatSidebar.style.display === '') {
        chatSidebar.style.display = 'flex';
        unreadCount = 0; chatBadge.style.display = 'none';
    } else chatSidebar.style.display = 'none';
};

document.getElementById('closeChatBtn').onclick = () => chatSidebar.style.display = 'none';

document.getElementById('sendChatBtn').onclick = () => {
    const input = document.getElementById('chatInput');
    if (input.value.trim() && currentRoom) {
        db.collection('rooms').doc(currentRoom).collection('chats').add({ text: input.value, sender: myUserId, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        input.value = "";
    }
};

function listenForChats(roomId) {
    db.collection('rooms').doc(roomId).collection('chats').orderBy('timestamp').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const isMyMsg = data.sender === myUserId;
                chatMessages.innerHTML += `<div class="chat-message ${isMyMsg ? 'my-msg' : ''}"><b style="font-size: 10px; opacity: 0.7;">${isMyMsg ? 'আপনি' : 'অন্যজন'}</b><br>${data.text}</div>`;
                chatMessages.scrollTop = chatMessages.scrollHeight;
                if (!isMyMsg && chatSidebar.style.display !== 'flex') {
                    unreadCount++; chatBadge.innerText = unreadCount; chatBadge.style.display = 'flex';
                }
            }
        });
    });
}

document.getElementById('leaveMeeting').onclick = async () => {
    if (confirm("মিটিং থেকে বের হতে চান?")) {
        for (let trackName in localTracks) {
            let track = localTracks[trackName];
            if (track) { track.stop(); track.close(); }
        }
        await client.leave();
        window.location.reload();
    }
};
