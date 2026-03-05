const servers = {
    iceServers: [
        { urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }
    ]
};

let localStream = null;
let peers = {}; // সকল কানেকশন স্টোর করার জন্য

// ক্যামেরা ও মাইক চালু করার ফাংশন
async function getLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 480, height: 360 }, 
            audio: true 
        });
        document.getElementById('localVideo').srcObject = localStream;
        return true;
    } catch (error) {
        console.error("ক্যামেরা এরর:", error);
        alert("ক্যামেরা বা মাইক্রোফোন পারমিশন দেওয়া হয়নি! দয়া করে পারমিশন দিন।");
        return false;
    }
}

// নতুন ইউজার আসলে কানেকশন তৈরি করার ফাংশন
function createPeerConnection(remoteUserId, sendSignalFunc) {
    if (peers[remoteUserId]) return peers[remoteUserId];

    const pc = new RTCPeerConnection(servers);
    peers[remoteUserId] = pc;

    // নিজের ভিডিও ট্র্যাকগুলো কানেকশনে যোগ করা
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // ICE Candidate তৈরি হলে Firebase-এ পাঠানোর জন্য callback কল করা
    pc.onicecandidate = event => {
        if (event.candidate) {
            sendSignalFunc(remoteUserId, {
                type: 'ice-candidate',
                candidate: event.candidate.toJSON()
            });
        }
    };

    // অপর পক্ষের ভিডিও আসলে স্ক্রিনে দেখানো
    pc.ontrack = event => {
        let remoteVideo = document.getElementById(`video-${remoteUserId}`);
        if (!remoteVideo) {
            remoteVideo = document.createElement('video');
            remoteVideo.id = `video-${remoteUserId}`;
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            document.getElementById('video-grid').appendChild(remoteVideo);
        }
        remoteVideo.srcObject = event.streams[0];
    };

    // কানেকশন কেটে গেলে ভিডিও রিমুভ করা
    pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            const vid = document.getElementById(`video-${remoteUserId}`);
            if (vid) vid.remove();
            delete peers[remoteUserId];
        }
    };

    return pc;
}
