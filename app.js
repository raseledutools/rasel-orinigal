// --- ১. Firebase কনফিগারেশন (আপনার দেওয়া ডাটা অনুযায়ী) ---
const firebaseConfig = {
    apiKey: "AIzaSyDGd3KAo45UuqmeGFALziz_oKm3htEASHY",
    authDomain: "mywebtools-f8d53.firebaseapp.com",
    projectId: "mywebtools-f8d53",
    storageBucket: "mywebtools-f8d53.firebasestorage.app",
    messagingSenderId: "979594414301",
    appId: "1:979594414301:web:7048c995e56e331a85f334"
};

// Firebase ইনিশিয়ালাইজেশন
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// --- ২. গ্লোবাল ভ্যারিয়েবল ও WebRTC সেটআপ ---
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

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

// URL থেকে রুম আইডি চেক (Invite Link)
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
    roomInput.value = roomParam;
}

// --- ৩. ক্যামেরা ও মাইক চালু করা ---
startCamBtn.onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480 }, 
            audio: true 
        });
        localVideo.srcObject = localStream;
        
        startCamBtn.style.display = 'none';
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
        console.log("ক্যামেরা ও অডিও রেডি!");
    } catch (error) {
        console.error("Camera Error:", error);
        alert("ক্যামেরা বা মাইক্রোফোন পারমিশন পাওয়া যায়নি! নিশ্চিত করুন আপনি HTTPS ব্যবহার করছেন।");
    }
};

// --- ৪. মিটিং তৈরি ও জয়েন লজিক ---
createRoomBtn.onclick = async () => {
    currentRoom = Math.floor(100000 + Math.random() * 900000).toString();
    await db.collection('rooms').doc(currentRoom).set({ created: true, createdAt: Date.now() });
    enterMeetingRoom();
};

joinRoomBtn.onclick = async () => {
    currentRoom = roomInput.value.trim();
    if (currentRoom.length !== 6) return alert("সঠিক ৬ ডিজিটের আইডি দিন!");
    
    const doc = await db.collection('rooms').doc(currentRoom).get();
    if (!doc.exists) return alert("এই আইডি দিয়ে কোনো মিটিং খুঁজে পাওয়া যায়নি!");
    
    enterMeetingRoom();
    // নতুন ইউজার জয়েন করেছে এই সিগন্যাল পাঠানো
    db.collection('rooms').doc(currentRoom).collection('messages').add({
        type: 'new-user', 
        sender: myUserId, 
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
};

function enterMeetingRoom() {
    joinScreen.style.display = 'none';
    displayRoomId.innerText = currentRoom;
    listenForSignaling(currentRoom);
}

// --- ৫. সিগন্যালিং এবং চ্যাট লজিক ---
function sendSignal(receiverId, data) {
    db.collection('rooms').doc(currentRoom).collection('messages').add({
        ...data,
        sender: myUserId,
        receiver: receiverId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function listenForSignaling(roomId) {
    db.collection('rooms').doc(roomId).collection('messages').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                
                // ১. চ্যাট মেসেজ প্রসেসিং
                if (data.type === 'chat') {
                    const isMyMsg = data.sender === myUserId;
                    const msgDiv = document.createElement('div');
                    msgDiv.className = `chat-message ${isMyMsg ? 'my-msg' : ''}`;
                    msgDiv.innerHTML = `<b style="font-size: 10px; opacity: 0.7;">${isMyMsg ? 'আপনি' : 'অন্যজন'}</b><br>${data.text}`;
                    chatMessages.appendChild(msgDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                    return;
                }

                if (data.sender === myUserId) return; // নিজের পাঠানো মেসেজ বাদ

                // ২. WebRTC কানেকশন প্রসেসিং
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
                    } 
                    else if (data.type === 'answer') {
                        const pc = peers[data.sender];
                        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    } 
                    else if (data.type === 'candidate') {
                        const pc = peers[data.sender];
                        if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    }
                }
            }
        });
    });
}

// --- ৬. WebRTC Peer কানেকশন তৈরি ---
function createPeerConnection(remoteUserId) {
    if (peers[remoteUserId]) return peers[remoteUserId];

    const pc = new RTCPeerConnection(servers);
    peers[remoteUserId] = pc;

    // নিজের ট্র্যাক কানেকশনে যুক্ত করা
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // ICE Candidate পাঠানো
    pc.onicecandidate = event => {
        if (event.candidate) {
            sendSignal(remoteUserId, { type: 'candidate', candidate: event.candidate.toJSON() });
        }
    };

    // অপর পক্ষ থেকে ভিডিও আসলে তা দেখানো
    pc.ontrack = event => {
        let remoteVid = document.getElementById(`video-${remoteUserId}`);
        if (!remoteVid) {
            remoteVid = document.createElement('video');
            remoteVid.id = `video-${remoteUserId}`;
            remoteVid.autoplay = true;
            remoteVid.playsInline = true;
            videoGrid.appendChild(remoteVid);
        }
        remoteVid.srcObject = event.streams[0];
    };

    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            document.getElementById(`video-${remoteUserId}`)?.remove();
            delete peers[remoteUserId];
        }
    };

    return pc;
}

// --- ৭. কন্ট্রোল বাটন লজিক (Mic, Cam, Screen, Chat, Invite) ---

// ইনভাইট লিংক কপি
document.getElementById('inviteBtn').onclick = () => {
    const inviteLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        alert("মিটিং লিংক কপি হয়েছে! শেয়ার করুন:\n" + inviteLink);
    });
};

// মিউট/আনমিউট
let isMuted = false;
document.getElementById('toggleMic').onclick = (e) => {
    isMuted = !isMuted;
    localStream.getAudioTracks()[0].enabled = !isMuted;
    e.currentTarget.classList.toggle('active-off');
    e.currentTarget.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};

// ক্যামেরা অন/অফ
let isVidOff = false;
document.getElementById('toggleCam').onclick = (e) => {
    isVidOff = !isVidOff;
    localStream.getVideoTracks()[0].enabled = !isVidOff;
    e.currentTarget.classList.toggle('active-off');
    e.currentTarget.innerHTML = isVidOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
};

// স্ক্রিন শেয়ার (GitHub Friendly লজিক)
let sharing = false;
document.getElementById('shareScreenBtn').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!sharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];

            Object.values(peers).forEach(pc => {
                const sender = pc.getSenders().find(s => s.track.kind === 'video');
                if (sender) sender.replaceTrack(screenTrack);
            });

            localVideo.srcObject = screenStream;
            localVideo.style.transform = "scaleX(1)";
            btn.classList.add('active-off');
            sharing = true;

            screenTrack.onended = () => stopSharing(btn);
        } catch (err) { console.error(err); }
    } else {
        stopSharing(btn);
    }
};

function stopSharing(btn) {
    const videoTrack = localStream.getVideoTracks()[0];
    Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
    });
    localVideo.srcObject = localStream;
    localVideo.style.transform = "scaleX(-1)";
    btn.classList.remove('active-off');
    sharing = false;
}

// চ্যাট ওপেন/ক্লোজ
document.getElementById('toggleChat').onclick = () => {
    const sidebar = document.getElementById('chatSidebar');
    sidebar.style.display = sidebar.style.display === 'none' ? 'flex' : 'none';
};
document.getElementById('closeChatBtn').onclick = () => {
    document.getElementById('chatSidebar').style.display = 'none';
};

// মেসেজ পাঠানো
document.getElementById('sendChatBtn').onclick = () => {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (msg && currentRoom) {
        db.collection('rooms').doc(currentRoom).collection('messages').add({
            type: 'chat',
            text: msg,
            sender: myUserId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = "";
    }
};

// মিটিং ত্যাগ করা
document.getElementById('leaveMeeting').onclick = () => {
    if (confirm("আপনি কি মিটিং ত্যাগ করতে চান?")) {
        window.location.href = window.location.origin + window.location.pathname;
    }
};
