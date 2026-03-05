// --- ১. Agora এবং Firebase কনফিগারেশন ---
const APP_ID = "e286b94ae5df4ae7a7359cc70e7e9b91"; 
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

const firebaseConfig = {
    apiKey: "AIzaSyDGd3KAo45UuqmeGFALziz_oKm3htEASHY",
    authDomain: "mywebtools-f8d53.firebaseapp.com",
    projectId: "mywebtools-f8d53"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// --- ২. গ্লোবাল ভ্যারিয়েবল ---
let localTracks = { videoTrack: null, audioTrack: null };
let screenTrack = null;
let currentRoom = null;
const myUserId = Math.floor(Math.random() * 10000).toString(); 
let unreadCount = 0;

const videoGrid = document.getElementById('video-grid');
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('room')) document.getElementById('roomInput').value = urlParams.get('room');

function generate6DigitID() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// --- ৩. ক্যামেরা চালু (HD Video & Pro Audio) ---
document.getElementById('startCamBtn').onclick = async () => {
    try {
        // ভিডিও এবং অডিও কোয়ালিটি হাই করা হয়েছে
        const audioConfig = { 
            AEC: true, // Echo Cancellation (সাউন্ড ইকো হবে না)
            ANS: true, // Noise Suppression (ব্যাকগ্রাউন্ড নয়েজ কমাবে)
            encoderConfig: "high_quality" 
        };
        const videoConfig = { 
            encoderConfig: {
                width: { max: 1280, ideal: 1280 }, // 720p HD
                height: { max: 720, ideal: 720 },
                frameRate: { max: 30, ideal: 30 }, // 30 FPS স্মুথ ভিডিও
                bitrateMin: 600, bitrateMax: 1500 // ফাস্ট নেটওয়ার্ক ম্যানেজমেন্ট
            } 
        };

        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(audioConfig, videoConfig);
        
        localTracks.videoTrack.play('local-player');

        document.getElementById('startCamBtn').style.display = 'none';
        document.getElementById('createRoomBtn').disabled = false;
        document.getElementById('joinRoomBtn').disabled = false;
    } catch (error) {
        console.error("ক্যামেরা এরর:", error);
        alert("ক্যামেরা বা মাইক্রোফোন পারমিশন পাওয়া যায়নি!");
    }
};

// --- ৪. মিটিং তৈরি ও জয়েন ---
document.getElementById('createRoomBtn').onclick = () => {
    currentRoom = generate6DigitID();
    joinMeeting(currentRoom);
};

document.getElementById('joinRoomBtn').onclick = () => {
    currentRoom = document.getElementById('roomInput').value.trim();
    if (currentRoom.length === 6) joinMeeting(currentRoom);
    else alert("সঠিক ৬ ডিজিটের আইডি দিন!");
};

async function joinMeeting(roomId) {
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('displayRoomId').innerText = roomId;

    try {
        await client.join(APP_ID, roomId, null, null);
        
        // ফাস্ট পারফরম্যান্সের জন্য Dual Stream চালু করা
        // (কারো ইন্টারনেট স্লো থাকলে সে নিজে থেকেই লো-কোয়ালিটি ভিডিও দেখবে যাতে কল না কাটে)
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
                videoGrid.appendChild(remoteBox);
            }
            user.videoTrack.play(remoteBox);
        }
        if (mediaType === "audio") {
            user.audioTrack.play();
        }
    });

    client.on("user-left", (user) => {
        document.getElementById(`user-${user.uid}`)?.remove();
    });
}

// --- ৫. Firebase চ্যাট লজিক ---
const chatMessages = document.getElementById('chatMessages');
const chatSidebar = document.getElementById('chatSidebar');
const chatBadge = document.getElementById('chatBadge');

function listenForChats(roomId) {
    db.collection('rooms').doc(roomId).collection('chats').orderBy('timestamp').onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const isMyMsg = data.sender === myUserId;
                
                const msgDiv = document.createElement('div');
                msgDiv.className = `chat-message ${isMyMsg ? 'my-msg' : ''}`;
                msgDiv.innerHTML = `<b style="font-size: 10px; opacity: 0.7;">${isMyMsg ? 'আপনি' : 'অন্যজন'}</b><br>${data.text}`;
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                if (!isMyMsg && chatSidebar.style.display !== 'flex') {
                    unreadCount++;
                    chatBadge.innerText = unreadCount;
                    chatBadge.style.display = 'flex';
                }
            }
        });
    });
}

// --- ৬. কন্ট্রোল বাটন লজিক ---

document.getElementById('inviteBtn').onclick = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    navigator.clipboard.writeText(link).then(() => alert("লিংক কপি হয়েছে!"));
};

let isMuted = false;
document.getElementById('toggleMic').onclick = async (e) => {
    isMuted = !isMuted;
    await localTracks.audioTrack.setMuted(isMuted);
    e.currentTarget.classList.toggle('active-off');
    e.currentTarget.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
};

let isVidOff = false;
document.getElementById('toggleCam').onclick = async (e) => {
    isVidOff = !isVidOff;
    await localTracks.videoTrack.setMuted(isVidOff);
    e.currentTarget.classList.toggle('active-off');
    e.currentTarget.innerHTML = isVidOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
};

let isSharingScreen = false;
document.getElementById('shareScreenBtn').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!isSharingScreen) {
        try {
            const screenTrackRes = await AgoraRTC.createScreenVideoTrack({
                encoderConfig: "1080p_1", // স্ক্রিন শেয়ারের কোয়ালিটি 1080p (Full HD) করা হলো
                optimizationMode: "detail" // টেক্সট যেন ক্লিয়ার দেখা যায়
            });
            screenTrack = Array.isArray(screenTrackRes) ? screenTrackRes[0] : screenTrackRes;

            await client.unpublish(localTracks.videoTrack);
            await client.publish(screenTrack);
            
            screenTrack.play('local-player');
            
            btn.classList.add('active-off');
            isSharingScreen = true;

            screenTrack.on("track-ended", () => stopSharing(btn));
        } catch (err) { console.error("Screen share error", err); }
    } else {
        stopSharing(btn);
    }
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

document.getElementById('toggleChat').onclick = () => {
    if (chatSidebar.style.display === 'none' || chatSidebar.style.display === '') {
        chatSidebar.style.display = 'flex';
        unreadCount = 0;
        chatBadge.style.display = 'none';
    } else {
        chatSidebar.style.display = 'none';
    }
};

document.getElementById('closeChatBtn').onclick = () => chatSidebar.style.display = 'none';

document.getElementById('sendChatBtn').onclick = () => {
    const input = document.getElementById('chatInput');
    if (input.value.trim() && currentRoom) {
        db.collection('rooms').doc(currentRoom).collection('chats').add({
            text: input.value, sender: myUserId, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = "";
    }
};

document.getElementById('leaveMeeting').onclick = async () => {
    if (confirm("মিটিং থেকে বের হতে চান?")) {
        for (let trackName in localTracks) {
            let track = localTracks[trackName];
            if (track) { track.stop(); track.close(); }
        }
        await client.leave();
        window.location.href = window.location.origin + window.location.pathname;
    }
};
