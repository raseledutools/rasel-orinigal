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
let isAdmin = false; 
let unreadCount = 0;

// ডিফল্ট স্টেট (শুরুতে অন থাকবে)
let state = { isMuted: false, isVidOff: false, isSharing: false };

// URL চেক (লিংক থেকে আসলে)
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    document.getElementById('direct-visit-ui').style.display = 'none';
    document.getElementById('join-link-ui').style.display = 'block';
}

// --- ৩. অটোমেটিক পারমিশন এবং ফোর্স সিঙ্ক ---
window.onload = async () => {
    try {
        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            { AEC: true, ANS: true, AGC: true, encoderConfig: "high_quality" }, 
            { encoderConfig: "720p_1" }
        );
        
        localTracks.videoTrack.play('pre-join-player');

        // FIX: হার্ডওয়্যার এবং UI ফোর্স সিঙ্ক করা
        await localTracks.audioTrack.setMuted(state.isMuted);
        await localTracks.videoTrack.setMuted(state.isVidOff);
        syncUI();

        document.getElementById('loading-overlay').style.display = 'none';
    } catch (error) {
        document.getElementById('loading-overlay').innerHTML = "<p style='color:red;'>ক্যামেরা/মাইক পারমিশন দিন, না হলে মিটিংয়ে কথা বলতে পারবেন না!</p>";
    }
};

// --- ৪. সেন্ট্রাল বাটন সিঙ্ক ফাংশন ---
function syncUI() {
    const micBtns = [document.getElementById('preMicBtn'), document.getElementById('mainMicBtn')];
    micBtns.forEach(btn => {
        if (!btn) return;
        if (state.isMuted) {
            btn.classList.add('active-off');
            btn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
        } else {
            btn.classList.remove('active-off');
            btn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
    });

    const camBtns = [document.getElementById('preCamBtn'), document.getElementById('mainCamBtn')];
    camBtns.forEach(btn => {
        if (!btn) return;
        if (state.isVidOff) {
            btn.classList.add('active-off');
            btn.innerHTML = '<i class="fas fa-video-slash"></i>';
        } else {
            btn.classList.remove('active-off');
            btn.innerHTML = '<i class="fas fa-video"></i>';
        }
    });
}

async function toggleMic() {
    state.isMuted = !state.isMuted;
    if (localTracks.audioTrack) await localTracks.audioTrack.setMuted(state.isMuted);
    syncUI();
}

async function toggleCam() {
    state.isVidOff = !state.isVidOff;
    if (localTracks.videoTrack) await localTracks.videoTrack.setMuted(state.isVidOff);
    syncUI();
}

document.getElementById('preMicBtn').onclick = toggleMic;
document.getElementById('mainMicBtn').onclick = toggleMic;
document.getElementById('preCamBtn').onclick = toggleCam;
document.getElementById('mainCamBtn').onclick = toggleCam;

// --- ৫. মিটিং তৈরি এবং জয়েন ---
document.getElementById('createRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value.trim() || userName;
    const newRoomId = Math.floor(100000 + Math.random() * 900000).toString();
    isAdmin = true; 
    startMeeting(newRoomId);
};

document.getElementById('joinRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value.trim() || userName;
    const roomId = document.getElementById('roomInput').value.trim();
    if (roomId.length === 6) {
        isAdmin = false;
        startMeeting(roomId);
    } else { alert("সঠিক ৬ ডিজিটের আইডি দিন!"); }
};

document.getElementById('joinFromLinkBtn').onclick = () => {
    userName = document.getElementById('userNameLink').value.trim() || userName;
    isAdmin = false;
    startMeeting(roomFromUrl);
};

// মেইন মিটিং ফাংশন
async function startMeeting(roomId) {
    currentRoom = roomId; 

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-meeting').style.display = 'flex';
    document.getElementById('displayRoomId').innerText = currentRoom;
    document.getElementById('my-name-badge').innerText = userName + (isAdmin ? " (Host)" : " (You)");

    // FIX: ভিডিও আগের জায়গা থেকে থামিয়ে নতুন জায়গায় প্লে করা
    if(localTracks.videoTrack) {
        localTracks.videoTrack.stop();
        localTracks.videoTrack.play('local-player');
    }
    document.getElementById('local-box').setAttribute('data-uid', 'local');

    // FIX: মিটিংয়ে ঢোকার পর আবার ফোর্স সিঙ্ক
    await localTracks.audioTrack.setMuted(state.isMuted);
    await localTracks.videoTrack.setMuted(state.isVidOff);
    syncUI();

    try {
        myAgoraUid = await client.join(APP_ID, currentRoom, null, null);
        document.getElementById('local-box').id = `user-${myAgoraUid}`;
        
        await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
        
        if (isAdmin) {
            await db.collection('rooms').doc(currentRoom).set({ active: true, admin: myAgoraUid }, { merge: true });
        }

        listenForGrid();
        listenForChats(currentRoom);
        listenForRoomStatus(currentRoom); 
    } catch (e) {
        console.error("Connection Error:", e);
        alert("মিটিংয়ে জয়েন করতে সমস্যা হচ্ছে। আবার চেষ্টা করুন।");
        window.location.reload();
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
        
        if (mediaType === "audio") {
            user.audioTrack.play();
        }
    });

    client.on("user-left", (user) => {
        document.getElementById(`user-${user.uid}`)?.remove();
        updateGridCount();
    });
}

function updateGridCount() {
    const grid = document.getElementById('video-grid');
    grid.setAttribute('data-users', grid.children.length);
}

// --- ৬. স্মার্ট স্ক্রিন শেয়ার ---
const shareBtn = document.getElementById('shareScreenBtn');

shareBtn.onclick = async () => {
    if (!state.isSharing) {
        try {
            const screenTrackRes = await AgoraRTC.createScreenVideoTrack({ encoderConfig: "1080p_1" });
            screenTrack = Array.isArray(screenTrackRes) ? screenTrackRes[0] : screenTrackRes;

            await client.unpublish(localTracks.videoTrack);
            await client.publish(screenTrack);
            screenTrack.play(`user-${myAgoraUid}`);
            
            state.isSharing = true;
            shareBtn.classList.add('active-off');
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
    
    state.isSharing = false;
    shareBtn.classList.remove('active-off');
    await db.collection('rooms').doc(currentRoom).update({ screenSharer: null });
}

function listenForGrid() {
    if(!currentRoom) return;
    db.collection('rooms').doc(currentRoom).onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const grid = document.getElementById('video-grid');
        
        document.querySelectorAll('.video-box').forEach(box => box.classList.remove('screen-active'));

        if (data && data.screenSharer) {
            grid.classList.add('sharing-active');
            const activeBox = document.getElementById(`user-${data.screenSharer}`);
            if (activeBox) activeBox.classList.add('screen-active');
            
            if (data.screenSharer !== myAgoraUid) {
                shareBtn.disabled = true; shareBtn.style.opacity = '0.5';
            }
        } else {
            grid.classList.remove('sharing-active');
            shareBtn.disabled = false; shareBtn.style.opacity = '1';
        }
    });
}

// --- ৭. চ্যাট সিস্টেম ---
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
                const nameStr = isMyMsg ? 'আপনি' : (data.senderName || 'Participant');
                document.getElementById('chatMessages').innerHTML += `<div class="chat-message ${isMyMsg ? 'my-msg' : ''}"><b style="font-size: 10px; opacity: 0.7;">${nameStr}</b><br>${data.text}</div>`;
                document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
                if (!isMyMsg && document.getElementById('chatSidebar').style.display !== 'flex') {
                    unreadCount++; document.getElementById('chatBadge').innerText = unreadCount; document.getElementById('chatBadge').style.display = 'flex';
                }
            }
        });
    });
}

// --- ৮. অ্যাডমিন এন্ড মিটিং এবং ডিলিট লজিক ---
document.getElementById('inviteBtn').onclick = () => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${currentRoom}`).then(() => alert("লিংক কপি হয়েছে!"));

document.getElementById('leaveMeetingBtn').onclick = async () => {
    const msg = isAdmin ? "আপনি কি মিটিংটি সবার জন্য শেষ করে দিতে চান? (চ্যাট ডিলিট হয়ে যাবে)" : "মিটিং থেকে বের হতে চান?";
    if (confirm(msg)) {
        if (isAdmin) {
            await db.collection('rooms').doc(currentRoom).update({ status: 'ended' });
            const chatDocs = await db.collection('rooms').doc(currentRoom).collection('chats').get();
            const batch = db.batch();
            chatDocs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            await db.collection('rooms').doc(currentRoom).delete();
        }
        
        if(state.isSharing) await stopSharing();
        localTracks.audioTrack?.close(); 
        localTracks.videoTrack?.close();
        await client.leave();
        window.location.href = window.location.pathname;
    }
};

function listenForRoomStatus(roomId) {
    db.collection('rooms').doc(roomId).onSnapshot(doc => {
        if (doc.exists && doc.data().status === 'ended' && !isAdmin) {
            alert("হোস্ট মিটিং শেষ করে দিয়েছেন।");
            localTracks.audioTrack?.close(); 
            localTracks.videoTrack?.close();
            client.leave().then(() => { window.location.href = window.location.pathname; });
        }
    });
}
