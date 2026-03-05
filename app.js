// --- 1. Configuration ---
const APP_ID = "3581d419edb9484eb108db498e6bcdcf"; 
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

const firebaseConfig = {
    apiKey: "AIzaSyDGd3KAo45UuqmeGFALziz_oKm3htEASHY",
    authDomain: "mywebtools-f8d53.firebaseapp.com",
    projectId: "mywebtools-f8d53"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 2. Global Variables ---
let localTracks = { videoTrack: null, audioTrack: null };
let screenTrack = null;
let currentRoom = null;
let userName = "Guest"; 
const myUserId = Math.floor(Math.random() * 100000).toString(); 
let myAgoraUid = null;
let isAdmin = false; 
let unreadCount = 0;

// THE FIX: Default State is completely OFF (true = muted/off)
let state = { isMuted: true, isVidOff: true, isSharing: false };

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    document.getElementById('direct-visit-ui').style.display = 'none';
    document.getElementById('join-link-ui').style.display = 'block';
}

// --- 3. Auto Permission & Auto Hardware Power OFF ---
window.onload = async () => {
    try {
        // Request permissions and create tracks
        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            { AEC: true, ANS: true, AGC: true, encoderConfig: "high_quality" }, 
            { encoderConfig: "720p_1" }
        );
        
        // Immediately turn off the hardware power!
        await localTracks.audioTrack.setEnabled(false);
        await localTracks.videoTrack.setEnabled(false);
        
        localTracks.videoTrack.play('pre-join-player');
        
        syncUI();
        document.getElementById('loading-overlay').style.display = 'none';
    } catch (error) {
        console.error("Device Error:", error);
        document.getElementById('loading-overlay').innerHTML = "<p style='color:red;'>Please allow camera/mic access to use the app!</p>";
        
        state.isMuted = true;
        state.isVidOff = true;
        syncUI();
    }
};

// --- 4. Central Button Sync Function ---
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
    const camOffMsg = document.getElementById('camOffMsg');
    
    camBtns.forEach(btn => {
        if (!btn) return;
        if (state.isVidOff) {
            btn.classList.add('active-off');
            btn.innerHTML = '<i class="fas fa-video-slash"></i>';
            if(camOffMsg) camOffMsg.style.display = 'block';
        } else {
            btn.classList.remove('active-off');
            btn.innerHTML = '<i class="fas fa-video"></i>';
            if(camOffMsg) camOffMsg.style.display = 'none';
        }
    });
}

// Hardware toggles
async function toggleMic() {
    state.isMuted = !state.isMuted;
    if (localTracks.audioTrack) {
        await localTracks.audioTrack.setEnabled(!state.isMuted);
    }
    syncUI();
}

async function toggleCam() {
    state.isVidOff = !state.isVidOff;
    if (localTracks.videoTrack) {
        await localTracks.videoTrack.setEnabled(!state.isVidOff);
    }
    syncUI();
}

document.getElementById('preMicBtn').onclick = toggleMic;
document.getElementById('mainMicBtn').onclick = toggleMic;
document.getElementById('preCamBtn').onclick = toggleCam;
document.getElementById('mainCamBtn').onclick = toggleCam;

// --- 5. Meeting Join Logic ---
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
    } else { alert("Please enter a valid 6-digit ID!"); }
};

document.getElementById('joinFromLinkBtn').onclick = () => {
    userName = document.getElementById('userNameLink').value.trim() || userName;
    isAdmin = false;
    startMeeting(roomFromUrl);
};

// The Main Meeting Function
async function startMeeting(roomId) {
    currentRoom = roomId; 

    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-meeting').style.display = 'flex';
    document.getElementById('displayRoomId').innerText = currentRoom;
    document.getElementById('my-name-badge').innerText = userName + (isAdmin ? " (Host)" : " (You)");

    if(localTracks.videoTrack) {
        localTracks.videoTrack.play('local-player');
    }
    document.getElementById('local-box').setAttribute('data-uid', 'local');
    
    syncUI();

    try {
        myAgoraUid = await client.join(APP_ID, currentRoom, null, null);
        document.getElementById('local-box').id = `user-${myAgoraUid}`;
        
        // Push tracks (They will push as muted/off if they are currently off)
        await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
        
        if (isAdmin) {
            await db.collection('rooms').doc(currentRoom).set({ active: true, admin: myAgoraUid }, { merge: true });
        }

        listenForGrid();
        listenForChats(currentRoom);
        listenForRoomStatus(currentRoom); 
    } catch (e) {
        console.error("Connection Error:", e);
        alert("Failed to join the meeting. Please refresh and try again.");
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

// --- 6. Screen Share ---
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
    
    // Resume original track if it wasn't turned off
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

// --- 7. Chat System ---
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
                const nameStr = isMyMsg ? 'You' : (data.senderName || 'Participant');
                document.getElementById('chatMessages').innerHTML += `<div class="chat-message ${isMyMsg ? 'my-msg' : ''}"><b style="font-size: 10px; opacity: 0.7;">${nameStr}</b><br>${data.text}</div>`;
                document.getElementById('chatMessages').scrollTop = document.getElementById('chatMessages').scrollHeight;
                if (!isMyMsg && document.getElementById('chatSidebar').style.display !== 'flex') {
                    unreadCount++; document.getElementById('chatBadge').innerText = unreadCount; document.getElementById('chatBadge').style.display = 'flex';
                }
            }
        });
    });
}

// --- 8. Admin Leave & Cleanup Logic ---
document.getElementById('inviteBtn').onclick = () => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${currentRoom}`).then(() => alert("Link copied to clipboard!"));

document.getElementById('leaveMeetingBtn').onclick = async () => {
    const msg = isAdmin ? "Do you want to end the meeting for all? (Chat will be deleted)" : "Do you want to leave the meeting?";
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
            alert("The host has ended the meeting.");
            localTracks.audioTrack?.close(); 
            localTracks.videoTrack?.close();
            client.leave().then(() => { window.location.href = window.location.pathname; });
        }
    });
}
