// Firebase কনফিগারেশন
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

const myUserId = Math.random().toString(36).substring(2, 10); // নিজের ইউনিক আইডি
let currentRoom = null;

// DOM Elements
const startCamBtn = document.getElementById('startCamBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomInput = document.getElementById('roomInput');
const currentRoomIdDisplay = document.getElementById('currentRoomId');

// ৬ ডিজিটের রেন্ডম আইডি জেনারেট করার ফাংশন
function generate6DigitID() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ১. ক্যামেরা চালু করা
startCamBtn.onclick = async () => {
    const success = await getLocalStream(); // webrtc.js থেকে কল হচ্ছে
    if (success) {
        startCamBtn.disabled = true;
        createRoomBtn.disabled = false;
        joinRoomBtn.disabled = false;
        startCamBtn.innerText = "ক্যামেরা চালু হয়েছে ✅";
    }
};

// ২. নতুন রুম (৬ ডিজিট) তৈরি করা
createRoomBtn.onclick = async () => {
    currentRoom = generate6DigitID();
    currentRoomIdDisplay.innerText = currentRoom;
    
    // ডাটাবেজে রুমটি তৈরি করে রাখা
    await db.collection('rooms').doc(currentRoom).set({ created: true });
    
    listenForSignaling(currentRoom);
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
};

// ৩. বিদ্যমান রুমে জয়েন করা
joinRoomBtn.onclick = async () => {
    currentRoom = roomInput.value.trim();
    if (currentRoom.length !== 6) return alert("দয়া করে সঠিক ৬ ডিজিটের আইডি দিন!");
    
    const roomRef = db.collection('rooms').doc(currentRoom);
    const doc = await roomRef.get();
    
    if (!doc.exists) {
        return alert("এই আইডির কোনো মিটিং পাওয়া যায়নি!");
    }

    currentRoomIdDisplay.innerText = currentRoom;
    listenForSignaling(currentRoom);
    
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;

    // আমি জয়েন করেছি, সেটা সবাইকে জানানো
    db.collection('rooms').doc(currentRoom).collection('messages').add({
        type: 'new-user',
        sender: myUserId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
};

// সিগন্যাল পাঠানোর ফাংশন (webrtc.js ব্যবহার করবে)
function sendSignal(receiverId, data) {
    db.collection('rooms').doc(currentRoom).collection('messages').add({
        ...data,
        sender: myUserId,
        receiver: receiverId
    });
}

// ৪. Firebase থেকে সিগন্যাল রিসিভ করা
function listenForSignaling(roomId) {
    db.collection('rooms').doc(roomId).collection('messages').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(async change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                
                // নিজের পাঠানো মেসেজ ইগনোর
                if (data.sender === myUserId) return;

                // নতুন কেউ আসলে তাকে Offer পাঠানো
                if (data.type === 'new-user') {
                    const pc = createPeerConnection(data.sender, sendSignal);
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    sendSignal(data.sender, { type: 'offer', sdp: offer });
                }

                // শুধু আমার জন্য পাঠানো মেসেজ
                if (data.receiver === myUserId) {
                    if (data.type === 'offer') {
                        const pc = createPeerConnection(data.sender, sendSignal);
                        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        sendSignal(data.sender, { type: 'answer', sdp: answer });
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
