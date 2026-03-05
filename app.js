// --- 1. Configuration ---
const APP_ID = "3581d419edb9484eb108db498e6bcdcf"; // MUST BE TESTING MODE APP ID
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
let currentRoom = null;
let userName = "Guest"; 
const myUserId = Math.floor(Math.random() * 100000).toString(); 
let myAgoraUid = null;
let isAdmin = false; 

// THE FIX: App starts completely OFF
let state = { isMuted: true, isVidOff: true, isSharing: false };

const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    document.getElementById('direct-visit-ui').style.display = 'none';
    document.getElementById('join-link-ui').style.display = 'block';
}

// --- 3. Initial Setup ---
window.onload = async () => {
    try {
        [localTracks.audioTrack, localTracks.videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            { AEC: true, ANS: true, AGC: true }, 
            { encoderConfig: "480p_1", optimizationMode: "motion" }
        );
        
        await localTracks.audioTrack.setEnabled(false);
        await localTracks.videoTrack.setEnabled(false);
        
        localTracks.videoTrack.play('pre-join-player');
    } catch (error) {
        console.warn("User denied camera/mic or device error.", error);
    }
    
    syncUI();
    document.getElementById('loading-overlay').style.display = 'none';
};

// --- 4. Controls UI Sync ---
function syncUI() {
    const micBtns = [document.getElementById('preMicBtn'), document.getElementById('mainMicBtn')];
    micBtns.forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('active-off', state.isMuted);
        btn.innerHTML = state.isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    });

    const camBtns = [document.getElementById('preCamBtn'), document.getElementById('mainCamBtn')];
    const camOffMsg = document.getElementById('camOffMsg');
    
    camBtns.forEach(btn => {
        if (!btn) return;
        btn.classList.toggle('active-off', state.isVidOff);
        btn.innerHTML = state.isVidOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
    });
    if(camOffMsg) camOffMsg.style.display = state.isVidOff ? 'flex' : 'none';
}

async function toggleMic() {
    state.isMuted = !state.isMuted;
    if (localTracks.audioTrack) await localTracks.audioTrack.setEnabled(!state.isMuted);
    syncUI();
}

async function toggleCam() {
    state.isVidOff = !state.isVidOff;
    if (localTracks.videoTrack) await localTracks.videoTrack.setEnabled(!state.isVidOff);
    syncUI();
}

document.getElementById('preMicBtn').onclick = toggleMic;
document.getElementById('mainMicBtn').onclick = toggleMic;
document.getElementById('preCamBtn').onclick = toggleCam;
document.getElementById('mainCamBtn').onclick = toggleCam;

// --- 5. Meeting Join Logic ---
document.getElementById('createRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value || "Host";
    isAdmin = true; 
    startMeeting(Math.floor(100000 + Math.random() * 900000).toString());
};
document.getElementById('joinRoomBtn').onclick = () => {
    userName = document.getElementById('userNameDirect').value || "Guest";
    const id = document.getElementById('roomInput').value;
    if(id.length === 6) startMeeting(id); else alert("Enter a valid 6-digit ID!");
};
document.getElementById('joinFromLinkBtn').onclick = () => {
    userName = document.getElementById('userNameLink').value || "Guest";
    startMeeting(roomFromUrl);
};

async function startMeeting(roomId) {
    currentRoom = roomId; 
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('main-meeting').style.display = 'flex';
    document.getElementById('displayRoomId').innerText = currentRoom;
    document.getElementById('my-name-badge').innerText = userName + (isAdmin ? " (Host)" : " (You)");

    if(localTracks.videoTrack) localTracks.videoTrack.play('local-player');
    document.getElementById('local-box').setAttribute('data-uid', 'local');
    syncUI();

    try {
        myAgoraUid = await client.join(APP_ID, currentRoom, null, null);
        document.getElementById('local-box').id = `user-${myAgoraUid}`;
        
        // BUG FIX: Filter out null tracks before publishing!
        let tracksToPublish = [];
        if (localTracks.audioTrack) tracksToPublish.push(localTracks.audioTrack);
        if (localTracks.videoTrack) tracksToPublish.push(localTracks.videoTrack);
        
        if (tracksToPublish.length > 0) {
            await client.publish(tracksToPublish);
        }
        
        if (isAdmin) await db.collection('rooms').doc(currentRoom).set({ admin: myAgoraUid, active: true }, { merge: true });

        listenForChats(currentRoom);
        listenForRoomStatus(currentRoom);
    } catch (e) {
        console.error("Agora Error Details:", e);
        // Smart Error Alert
        if (e.code === "CAN_NOT_GET_GATEWAY_SERVER" || e.message?.includes("token")) {
            alert("CRITICAL ERROR: Your App ID is in 'Secure' mode! You must create a new App ID in 'Testing mode' from Agora Console.");
        } else {
            alert("Connection error. Check your network.");
        }
        window.location.reload();
    }

    client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "video") {
            let rb = document.getElementById(`user-${user.uid}`);
            if (!rb) {
                rb = document.createElement("div");
                rb.id = `user-${user.uid}`;
                rb.className = "video-box";
                rb.innerHTML = `<span class="name-badge">Participant</span>`;
                document.getElementById('video-grid').appendChild(rb);
            }
            user.videoTrack.play(rb.id);
            updateGridCount();
        }
        if (mediaType === "audio") user.audioTrack.play();
    });

    client.on("user-left", (user) => { document.getElementById(`user-${user.uid}`)?.remove(); updateGridCount(); });
}

function updateGridCount() {
    const grid = document.getElementById('video-grid');
    grid.setAttribute('data-users', grid.children.length);
}

// --- 6. Controls & Chat ---
document.getElementById('inviteBtn').onclick = () => navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?room=${currentRoom}`).then(() => alert("Meeting Link Copied!"));

let unreadC = 0;
document.getElementById('toggleChat').onclick = () => {
    const sb = document.getElementById('chatSidebar');
    sb.style.display = (sb.style.display === 'none' || !sb.style.display) ? 'flex' : 'none';
    if (sb.style.display === 'flex') { unreadC = 0; document.getElementById('chatBadge').style.display = 'none'; }
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
                    unreadC++; document.getElementById('chatBadge').innerText = unreadC; document.getElementById('chatBadge').style.display = 'flex';
                }
            }
        });
    });
}

document.getElementById('leaveMeetingBtn').onclick = async () => {
    if (confirm(isAdmin ? "End meeting for all?" : "Leave the meeting?")) {
        if (isAdmin) {
            await db.collection('rooms').doc(currentRoom).update({ status: 'ended' });
            const chatDocs = await db.collection('rooms').doc(currentRoom).collection('chats').get();
            const batch = db.batch();
            chatDocs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            await db.collection('rooms').doc(currentRoom).delete();
        }
        localTracks.audioTrack?.close(); localTracks.videoTrack?.close();
        window.location.href = window.location.pathname;
    }
};

function listenForRoomStatus(roomId) {
    db.collection('rooms').doc(roomId).onSnapshot(doc => {
        if (doc.exists && doc.data().status === 'ended' && !isAdmin) {
            alert("The host ended the meeting.");
            localTracks.audioTrack?.close(); localTracks.videoTrack?.close();
            window.location.href = window.location.pathname;
        }
    });
}
