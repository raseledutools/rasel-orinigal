// --- নতুন বাটনগুলোর লজিক (app.js এর শেষে যুক্ত করুন) ---

// ১. ইনভাইট লিংক তৈরি এবং অটো-জয়েন লজিক
const urlParams = new URLSearchParams(window.location.search);
const roomFromUrl = urlParams.get('room');

if (roomFromUrl) {
    document.getElementById('roomInput').value = roomFromUrl; // লিংক থেকে আসলে আইডি অটো বসে যাবে
}

document.getElementById('inviteBtn').onclick = () => {
    const inviteLink = `${window.location.origin}${window.location.pathname}?room=${currentRoom}`;
    navigator.clipboard.writeText(inviteLink).then(() => {
        alert("ইনভাইট লিংক কপি হয়েছে! বন্ধুদের সাথে শেয়ার করুন।\nলিংক: " + inviteLink);
    });
};

// ২. Mic Mute/Unmute কন্ট্রোল
let isMicMuted = false;
document.getElementById('toggleMic').onclick = (e) => {
    isMicMuted = !isMicMuted;
    localStream.getAudioTracks()[0].enabled = !isMicMuted; // অডিও ট্র্যাক অন/অফ
    
    const icon = e.currentTarget.querySelector('i');
    e.currentTarget.classList.toggle('active-off');
    icon.className = isMicMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
};

// ৩. Camera On/Off কন্ট্রোল
let isVideoOff = false;
document.getElementById('toggleCam').onclick = (e) => {
    isVideoOff = !isVideoOff;
    localStream.getVideoTracks()[0].enabled = !isVideoOff; // ভিডিও ট্র্যাক অন/অফ
    
    const icon = e.currentTarget.querySelector('i');
    e.currentTarget.classList.toggle('active-off');
    icon.className = isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
};

// ৪. চ্যাট হাইড/শো করা
const chatSidebar = document.getElementById('chatSidebar');
document.getElementById('toggleChat').onclick = () => {
    chatSidebar.style.display = chatSidebar.style.display === 'none' ? 'flex' : 'none';
};

// ৫. মিটিং থেকে বের হওয়া (Leave Meeting)
document.getElementById('leaveMeeting').onclick = () => {
    if(confirm("আপনি কি মিটিং থেকে বের হতে চান?")) {
        window.location.href = window.location.pathname; // পেজ রিলোড দিয়ে বের করে দেওয়া
    }
};

// ৬. Join বা Create সাকসেস হলে Overlay সড়িয়ে ফেলা
// (আপনার existing createRoomBtn.onclick এবং joinRoomBtn.onclick এর ভিতরে এই লাইনটি যোগ করবেন)
// document.getElementById('join-screen').style.display = 'none';
// document.getElementById('displayRoomId').innerText = currentRoom;
