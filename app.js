// ১. Firebase কনফিগারেশন
const firebaseConfig = {
    apiKey: "AIzaSyDGd3KAo45UuqmeGFALziz_oKm3htEASHY",
    authDomain: "mywebtools-f8d53.firebaseapp.com",
    projectId: "mywebtools-f8d53",
    storageBucket: "mywebtools-f8d53.firebasestorage.app",
    messagingSenderId: "979594414301",
    appId: "1:979594414301:web:7048c995e56e331a85f334"
};

// Firebase ইনিশিয়ালাইজেশন
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ২. WebRTC এবং গ্লোবাল ভ্যারিয়েবল
const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

let localStream = null;
let peers = {}; // সকল কানেকশন স্টোর করার অবজেক্ট
const myUserId = Math.random().toString(36).substring(2, 15); // নিজের জন্য একটি ইউনিক আইডি
let currentRoom = null;

// DOM এলিমেন্ট
const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('video-grid');
const startCamBtn = document.getElementById('startCamBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomInput = document.getElementById('roomInput');
const currentRoomIdDisplay = document.getElementById('currentRoomId');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const sharedLinks = document.getElementById('shared-links');

// ৩. ক্যামেরা ও মাইক্রোফোন চালু করা (ব্যান্ডউইথ বাঁচানোর জন্য রেজোলিউশন কমানো হয়েছে)
startCamBtn.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 320, height: 240 }, // ১০ জনের জন্য ছোট রেজোলিউশন
        audio: true 
    });
    localVideo.srcObject = localStream;
    
    startCamBtn.disabled = true;
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
};

// ৪. নতুন রুম তৈরি করা
createRoomBtn.onclick = async () => {
    const roomRef = db.collection('rooms').doc();
    currentRoom = roomRef.id;
    currentRoomIdDisplay.innerText = currentRoom;
    listenForSignaling(currentRoom);
    alert("রুম তৈরি হয়েছে! অন্যদের এই আইডিটি দিন: " + currentRoom);
};

// ৫. বিদ্যমান রুমে জয়েন করা
joinRoomBtn.onclick = async () => {
    currentRoom = roomInput.value.trim();
    if (!currentRoom) return alert("দয়া করে রুম আইডি দিন");
    currentRoomIdDisplay.innerText = currentRoom;
    
    listenForSignaling(currentRoom);
    
    // রুমে জয়েন করার পর সবাইকে জানানোর জন্য একটি 'new-user' মেসেজ পাঠানো
    db.collection('rooms').doc(currentRoom).collection('messages').add({
        type: 'new-user',
        sender: myUserId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
};

// ৬. সিগন্যালিং হ্যান্ডেল করা (ম্যাস টপোলজি)
function listenForSignaling(roomId) {
    const messagesRef = db.collection('rooms').doc(roomId).collection('messages');
    
    // ফাইল শেয়ারিংয়ের জন্য আলাদা লিসেনার
    db.collection('rooms').doc(roomId).collection('files').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                sharedLinks.innerHTML += `<a href="${data.url}" target="_blank">📄 নতুন ফাইল: ${data.name}</a>`;
            }
        });
    });

    messagesRef.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                
                // নিজের পাঠানো মেসেজ ইগনোর করুন
                if (data.sender === myUserId) return;

                // নতুন ইউজার আসলে তাকে একটি Offer পাঠাবো
                if (data.type === 'new-user') {
                    const pc = createPeerConnection(data.sender, roomId);
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    
                    messagesRef.add({
                        type: 'offer',
                        sender: myUserId,
                        receiver: data.sender,
                        sdp: offer
                    });
                }

                // শুধু আমার জন্য পাঠানো মেসেজগুলো প্রসেস করব
                if (data.receiver === myUserId) {
                    if (data.type === 'offer') {
                        const pc = createPeerConnection(data.sender, roomId);
                        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        
                        messagesRef.add({
                            type: 'answer',
                            sender: myUserId,
                            receiver: data.sender,
                            sdp: answer
                        });
                    } 
                    else if (data.type === 'answer') {
                        const pc = peers[data.sender];
                        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                    } 
                    else if (data.type === 'ice-candidate') {
                        const pc = peers[data.sender];
                        if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                    }
                }
            }
        });
    });
}

// ৭. পিয়ার কানেকশন তৈরি করা (ভিডিও আদান-প্রদান)
function createPeerConnection(remoteUserId, roomId) {
    if (peers[remoteUserId]) return peers[remoteUserId];

    const pc = new RTCPeerConnection(servers);
    peers[remoteUserId] = pc;

    // নিজের ভিডিও ট্র্যাকগুলো কানেকশনে যোগ করা
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // ICE Candidate পেলে Firebase-এ পাঠানো
    pc.onicecandidate = event => {
        if (event.candidate) {
            db.collection('rooms').doc(roomId).collection('messages').add({
                type: 'ice-candidate',
                sender: myUserId,
                receiver: remoteUserId,
                candidate: event.candidate.toJSON()
            });
        }
    };

    // অপর পক্ষের ভিডিও পেলে HTML-এ দেখানো
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

    // ইউজার চলে গেলে ভিডিও রিমুভ করা
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            const vid = document.getElementById(`video-${remoteUserId}`);
            if (vid) vid.remove();
            delete peers[remoteUserId];
        }
    };

    return pc;
}

// ৮. Cloudinary-তে ফাইল আপলোড এবং মিটিংয়ে শেয়ার করা
uploadBtn.onclick = async () => {
    if (!currentRoom) return alert("আগে একটি রুমে জয়েন করুন!");
    const file = fileInput.files[0];
    if (!file) return alert("একটি ফাইল সিলেক্ট করুন");

    uploadBtn.innerText = "আপলোড হচ্ছে...";
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default'); // আপনার Unsigned Preset

    try {
        const res = await fetch("https://api.cloudinary.com/v1_1/de2w78yxh/auto/upload", {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        // ফাইল URL Firebase-এ সেভ করা যাতে সবাই দেখতে পায়
        await db.collection('rooms').doc(currentRoom).collection('files').add({
            name: file.name,
            url: data.secure_url,
            sender: myUserId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        uploadBtn.innerText = "আপলোড";
        fileInput.value = "";
    } catch (error) {
        console.error("Upload failed", error);
        uploadBtn.innerText = "আপলোড ব্যর্থ";
    }
};