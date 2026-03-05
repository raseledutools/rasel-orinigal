// --- ১. Firebase কনফিগারেশন ---
const firebaseConfig = {
    apiKey: "AIzaSyDGd3KAo45UuqmeGFALziz_oKm3htEASHY",
    authDomain: "mywebtools-f8d53.firebaseapp.com",
    projectId: "mywebtools-f8d53",
    storageBucket: "mywebtools-f8d53.firebasestorage.app",
    messagingSenderId: "979594414301",
    appId: "1:979594414301:web:7048c995e56e331a85f334"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- ২. গ্লোবাল ভ্যারিয়েবল ও WebRTC সেটআপ ---
const servers = { iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }] };
let localStream = null;
let screenStream = null;
let peers = {}; 
const myUserId = Math.random().toString(36).substring(2, 10);
let currentRoom = null;

// DOM Elements
const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('video-grid');
const startCamBtn = document.getElementById('startCamBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomInput = document.getElementById('roomInput');
const joinScreen = document.getElementById('join-screen');
const displayRoomId = document.getElementById('displayRoomId');
const chatMessages = document.getElementById('chatMessages');

// URL থেকে রুম আইডি নেওয়া
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) {
    roomInput.value = urlParams.get('room');
}

function generate6DigitID() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// --- ৩. ক্যামেরা ও মাইক চালু ---
startCamBtn.onclick = async () => {
    try {
        // স্ক্রিন শেয়ার এবং ভিডিওর জন্য পারমিশন
        localStream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 }, audio: true });
        localVideo.srcObject = localStream;
        
        startCamBtn.style.display = 'none';
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
        console.log("ক্যামেরা চালু হয়েছে!");
    } catch (error) {
        console.error("Camera Error:", error);
        alert("ক্যামেরা বা মাইক্রোফোন পারমিশন দেওয়া হয়নি অথবা ফাইলটি Live Server-এ ওপেন করা হয়নি!");
    }
};

// --- ৪. রুম তৈরি ও জয়েন ---
createRoomBtn.onclick = async () => {
    currentRoom = generate6DigitID();
    await db.collection('rooms').doc(currentRoom).set({ created: true });
    enterMeetingRoom();
};

joinRoomBtn.onclick = async () => {
    currentRoom = roomInput.value.trim();
    if (currentRoom.length !== 6) return alert("সঠিক ৬ ডিজিটের আইডি দিন!");
    
    const doc = await db.collection('rooms').doc(currentRoom).get();
    if (!doc.exists) return alert("এই আইডির কোনো মিটিং পাওয়া যায়নি!");
    
    enterMeetingRoom();
    db.collection('rooms').doc(currentRoom).collection('messages').add({
        type: 'new-user', sender: myUserId, timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
};

function enterMeetingRoom() {
    joinScreen.style.display = 'none';
    displayRoomId.innerText = currentRoom;
    listenForSignaling(currentRoom);
}

// --- ৫. Firebase Signaling ও চ্যাট রিসিভ ---
function sendSignal(receiverId, data) {
    db.collection('rooms').doc(currentRoom).collection('messages').add({ ...data, sender: myUserId, receiver: receiverId });
}

function listenForSignaling(roomId) {
    // FIX: orderBy('timestamp') মুছে দেওয়া হয়েছে যাতে Firebase Error না দেয়
    db.collection('rooms').doc(roomId).collection('messages').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                
                // চ্যাট মেসেজ
                if (data.type === 'chat') {
                    const isMyMsg = data.sender === myUserId;
                    chatMessages.innerHTML += `<div class="chat-message ${isMyMsg ? 'my-msg' : ''}">
                        <b style="font-size: 10px; opacity: 0.7;">${isMyMsg ? 'আপনি' : 'অন্যজন'}</b><br>${data.text}
                    </div>`;
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    return;
                }

                if (data.sender === myUserId) return; // নিজের সিগন্যাল ইগনোর

                // WebRTC Signaling
                try {
                    if (data.type === 'new-user') {
                        const pc = createPeerConnection(data.sender);
                        const offer = await pc.createOffer();
                        await pc.setLocalDescription(offer);
                        sendSignal(data.sender, { type: 'offer', sdp: offer });
                    }

                    if (data.receiver === myUserId) {
                        if (data.type === 'offer') {
                            const pc = createPeerConnection(data.sender);
                            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                            const answer = await pc.createAnswer();
                            await pc.setLocalDescription(answer);
                            sendSignal(data.sender, { type: 'answer', sdp: answer });
                        } else if (data.type === 'answer') {
                            const pc = peers[data.sender];
                            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                        } else if (data.type === 'ice-candidate') {
                            const pc = peers[data.sender];
                            if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                        }
                    }
                } catch (err) {
                    console.error("WebRTC Error:", err);
                }
            }
        });
    });
}

// --- ৬. WebRTC Peer Connection ---
function createPeerConnection(remoteUserId) {
    if (peers[remoteUserId]) return peers[remoteUserId];

    const pc = new RTCPeerConnection(servers);
    peers[remoteUserId] = pc;

    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = event => {
        if (event.candidate) sendSignal(remoteUserId, { type: 'ice-candidate', candidate: event.candidate.toJSON() });
    };

    pc.ontrack = event => {
        let remoteVideo = document.getElementById(`video-${remoteUserId}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `video-${remoteUserId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            videoGrid.appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            document.getElementById(`video-${remoteUserId}`)?.remove();
            delete peers[remoteUserId];
        }
    };

    return pc;
}

// --- ৭. কন্ট্রোল বাটনগুলো ---

// Invite Link
document.getElementById('inviteBtn').onclick = () => {
    const inviteLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    navigator.clipboard.writeText(inviteLink).then(() => alert("ইনভাইট লিংক কপি হয়েছে!\n" + inviteLink));
};

// Mic Mute
let isMicMuted = false;
document.getElementById('toggleMic').onclick = (e) => {
    isMicMuted = !isMicMuted;
    localStream.getAudioTracks()[0].enabled = !isMicMuted;
    e.currentTarget.classList.toggle('active-off');
    e.currentTarget.innerHTML = isMicMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};

// Camera Off
let isVideoOff = false;
document.getElementById('toggleCam').onclick = (e) => {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff;
    e.currentTarget.classList.toggle('active-off');
    e.currentTarget.innerHTML = isVideoOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
};

// Screen Share (FIXED)
let isSharingScreen = false;
document.getElementById('shareScreenBtn').onclick = async (e) => {
    const btnElement = e.currentTarget;
    
    if (!isSharingScreen) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            
            Object.values(peers).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });
            
            localVideo.srcObject = screenStream;
            localVideo.style.transform = 'scaleX(1)'; 
            
            btnElement.classList.add('active-off');
            isSharingScreen = true;

            // ব্রাউজারের ডিফল্ট "Stop Sharing" বাটনে ক্লিক করলে
            screenTrack.onended = () => stopScreenShare(btnElement);
        } catch (err) { 
            console.error("Screen share error: Browser permission denied or not supported.", err); 
        }
    } else {
        stopScreenShare(btnElement);
    }
};

function stopScreenShare(btnElement) {
    if(!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    
    Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
    });
    
    localVideo.srcObject = localStream;
    localVideo.style.transform = 'scaleX(-1)';
    btnElement.classList.remove('active-off');
    isSharingScreen = false;
}

// Chat toggle & Send
const chatSidebar = document.getElementById('chatSidebar');
document.getElementById('toggleChat').onclick = () => chatSidebar.style.display = 'flex';
document.getElementById('closeChatBtn').onclick = () => chatSidebar.style.display = 'none';

document.getElementById('sendChatBtn').onclick = () => {
    const input = document.getElementById('chatInput');
    if (input.value.trim() && currentRoom) {
        db.collection('rooms').doc(currentRoom).collection('messages').add({
            type: 'chat', text: input.value, sender: myUserId, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = "";
    }
};

document.getElementById('leaveMeeting').onclick = () => {
    if(confirm("মিটিং থেকে বের হতে চান?")) window.location.href = window.location.pathname;
};
