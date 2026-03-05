// আপনার Firebase Config এখানে দিন
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// WebRTC Servers
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

let localStream = null;
let peers = {};
const myUserId = Math.random().toString(36).substring(2, 9);
let currentRoom = null;

// ক্যামেরা পারমিশন চেক ও স্টার্ট
document.getElementById('startCamBtn').onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        document.getElementById('localVideo').srcObject = localStream;
        
        document.getElementById('startCamBtn').style.display = 'none';
        document.getElementById('createRoomBtn').disabled = false;
        document.getElementById('joinRoomBtn').disabled = false;
    } catch (e) {
        console.error("Permission denied", e);
        alert("ক্যামেরা বা মাইক অ্যাক্সেস পাওয়া যায়নি। ব্রাউজারের সেটিংস থেকে পারমিশন দিন।");
    }
};

// রুম তৈরি (৬ ডিজিট)
document.getElementById('createRoomBtn').onclick = async () => {
    currentRoom = Math.floor(100000 + Math.random() * 900000).toString();
    await db.collection('rooms').doc(currentRoom).set({ status: 'active' });
    enterRoom();
};

// রুমে জয়েন
document.getElementById('joinRoomBtn').onclick = async () => {
    currentRoom = document.getElementById('roomInput').value;
    if (currentRoom.length !== 6) return alert("৬ ডিজিটের আইডি দিন");
    
    const doc = await db.collection('rooms').doc(currentRoom).get();
    if (doc.exists) {
        enterRoom();
        // নতুন ইউজার আসার সিগন্যাল
        db.collection('rooms').doc(currentRoom).collection('messages').add({
            type: 'new-user', sender: myUserId
        });
    } else {
        alert("রুম পাওয়া যায়নি!");
    }
};

function enterRoom() {
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('displayRoomId').innerText = currentRoom;
    listenForMessages();
}

// Signaling লজিক (Offer, Answer, ICE Candidate)
function listenForMessages() {
    db.collection('rooms').doc(currentRoom).collection('messages').onSnapshot(snap => {
        snap.docChanges().forEach(async change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                if (data.sender === myUserId) return;

                if (data.type === 'new-user') {
                    makeOffer(data.sender);
                } else if (data.receiver === myUserId) {
                    if (data.type === 'offer') handleOffer(data.sdp, data.sender);
                    else if (data.type === 'answer') handleAnswer(data.sdp, data.sender);
                    else if (data.type === 'candidate') handleCandidate(data.candidate, data.sender);
                }
            }
        });
    });
}

async function makeOffer(remoteId) {
    const pc = createPC(remoteId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSig(remoteId, { type: 'offer', sdp: offer });
}

async function handleOffer(sdp, remoteId) {
    const pc = createPC(remoteId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendSig(remoteId, { type: 'answer', sdp: answer });
}

async function handleAnswer(sdp, remoteId) {
    const pc = peers[remoteId];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(sdp));
}

async function handleCandidate(candidate, remoteId) {
    const pc = peers[remoteId];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
}

function sendSig(receiverId, data) {
    db.collection('rooms').doc(currentRoom).collection('messages').add({
        ...data, sender: myUserId, receiver: receiverId
    });
}

function createPC(remoteId) {
    if (peers[remoteId]) return peers[remoteId];
    const pc = new RTCPeerConnection(servers);
    peers[remoteId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = e => {
        if (e.candidate) sendSig(remoteId, { type: 'candidate', candidate: e.candidate.toJSON() });
    };

    pc.ontrack = e => {
        let vid = document.getElementById(`video-${remoteId}`);
        if (!vid) {
            vid = document.createElement('video');
            vid.id = `video-${remoteId}`;
            vid.autoplay = true;
            vid.playsInline = true;
            document.getElementById('video-grid').appendChild(vid);
        }
        vid.srcObject = e.streams[0];
    };
    return pc;
}

// স্ক্রিন শেয়ার ফিক্স
document.getElementById('shareScreenBtn').onclick = async () => {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];
        
        Object.values(peers).forEach(pc => {
            const sender = pc.getSenders().find(s => s.track.kind === 'video');
            sender.replaceTrack(track);
        });
        
        document.getElementById('localVideo').srcObject = stream;
        track.onended = () => stopShare();
    } catch (err) { console.error(err); }
};

function stopShare() {
    const videoTrack = localStream.getVideoTracks()[0];
    Object.values(peers).forEach(pc => {
        const sender = pc.getSenders().find(s => s.track.kind === 'video');
        sender.replaceTrack(videoTrack);
    });
    document.getElementById('localVideo').srcObject = localStream;
}
