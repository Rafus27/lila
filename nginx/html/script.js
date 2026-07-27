// SECTIONS

const lobby = document.getElementById("lobby");
const game = document.getElementById("game");
const info = document.getElementById("info");

// LOBBY

const createGame = document.getElementById("create-game");
const gameIdInput = document.getElementById("game-id");
const joinGame = document.getElementById("join-game");
const reconnect = document.getElementById("reconnect");

// VIDEO

const adminVideo = document.getElementById("admin-video");
const video1 = document.getElementById("1-video");
const video2 = document.getElementById("2-video");
const video3 = document.getElementById("3-video");
const video4 = document.getElementById("4-video");
const video5 = document.getElementById("5-video");


// CURRENT PLAYER

const currentColor = document.getElementById("current-color");
const currentPosition = document.getElementById("current-position");
const currentName = document.getElementById("current-name");
const currentRequest = document.getElementById("current-request");


// BUTTONS

const action = document.getElementById("action");
const skip = document.getElementById("skip");
const pause = document.getElementById("pause");
const setPosition = document.getElementById("set-position");
const ban = document.getElementById("ban");

const help = document.getElementById("help");
const resource = document.getElementById("resource");
const wisdom = document.getElementById("wisdom");

const gameLink = document.getElementById("game-link");


const diceImg = document.getElementById("dice-img");
const moveImg = document.getElementById("move-img");
const nextImg = document.getElementById("next-img");
const startImg = document.getElementById("start-img");


// INFO

const playersList = document.getElementById("players-list");

const playerName = document.getElementById("player-name");
const playerColor = document.getElementById("player-color");
const playerStatus = document.getElementById("player-status");
const playerRequest = document.getElementById("player-request");
const playerPosition = document.getElementById("player-position");
const playerDice = document.getElementById("player-dice");
const playerHistory = document.getElementById("player-history");


// AVATAR 

const avatarInputs = document.getElementById("avatar-inputs");
const avatarName = document.getElementById("input-name");
const avatarRequest = document.getElementById("input-request");

const colorViolet = document.getElementById("violet");
const colorPurple = document.getElementById("purple");
const colorBlue = document.getElementById("blue");
const colorGreen = document.getElementById("green");
const colorYellow = document.getElementById("yellow");
const colorOrange = document.getElementById("orange");
const colorRed = document.getElementById("red");

const submitAvatar = document.getElementById("submit")


// DATA

const HOST = `https://${window.location.hostname}` //"http://localhost:8080"
let ws;
// let rtcConfig = {}
// const peerConnections = new Map();
// const mediaStreams = new Map();
// let isFirstRtc = true;

let token = "";
let ticket = "";
let playerId = "";
let playerRole = "";
let playerAvatarName = "";
let playerAvatarRequest = "";
let playerAvatarColor = "";
let gameId = "";
let gameData = {}
let selectedPlayer = "";




// LISTENERS

createGame.addEventListener("click", adminCreateAndJoin);
gameIdInput.addEventListener("change", e => gameId = e.target.value);
joinGame.addEventListener("click", playerJoin);
reconnect.addEventListener("click", reconnectToGame);

action.addEventListener("click", handleAction);
gameLink.addEventListener("click", copyLink);




// ADMIN

function adminCreateAndJoin() {

    fetch(`${HOST}/api/admin/auth`, {
        method: "POST"
    })
        .then(response => response.json())
        .then(res => {
            token = res.token;
            playerId = res.id;
            playerRole = res.role;


            sessionStorage.setItem("token", token);
            sessionStorage.setItem("player_id", playerId);
            sessionStorage.setItem("player_role", playerRole);
            return;
        })
        .then(() => {
            return fetch(`${HOST}/api/admin/games`, {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token
                }
            })
        })
        .then(response => response.json())
        .then(res => {
            gameId = res.gameId;
            sessionStorage.setItem("game_id", gameId);
        })
        .then(() => {
            return fetch(`${HOST}/api/tickets/${gameId}`, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + token
                }
            })
        })
        .then(response => response.json())
        .then(res => {
            ticket = res.ticket;

            lobby.style.display = "none";
            game.style.display = "flex";
            info.style.display = "flex";
        })
        .then(() => {
            ws = new WebSocket(`${HOST}/api?t=${ticket}`);

            ws.onopen = e => {
                console.log("connection open")
                ws.send(fmt(14));
                ws.send(fmt(23));
                setAvatar()
            };

            ws.onerror = e => console.log("WebSocket Error: " + e);

            ws.onclose = e => console.log("connection close");

            ws.onmessage = e => handleMessage(JSON.parse(e.data));
        })
}

// PLAYER

function playerJoin() {

    fetch(`${HOST}/api/player/auth`, {
        method: "POST"
    })
        .then(response => response.json())
        .then(res => {
            token = res.token;
            playerId = res.id;
            playerRole = res.role;

            sessionStorage.setItem("token", token);
            sessionStorage.setItem("player_id", playerId);
            sessionStorage.setItem("player_role", playerRole);
            sessionStorage.setItem("game_id", gameId);
        })
        .then(() => {
            return fetch(`${HOST}/api/tickets/${gameId}`, {
                method: "GET",
                headers: {
                    "Authorization": "Bearer " + token
                }
            })
        })
        .then(response => response.json())
        .then(res => {
            ticket = res.ticket;

            lobby.style.display = "none";
            game.style.display = "flex";
            info.style.display = "flex";
        })
        .then(() => {
            ws = new WebSocket(`${HOST}/api?t=${ticket}`);

            ws.onopen = e => {
                console.log("connection open")
                ws.send(fmt(14))
                ws.send(fmt(12))
                setAvatar()
            };

            ws.onerror = e => console.log("WebSocket Error: " + e);

            ws.onclose = e => console.log("connection close");

            ws.onmessage = e => handleMessage(JSON.parse(e.data));
        })
}

// RECONNECT

function reconnectToGame() {

    console.log("reconnect");


    token = sessionStorage.getItem("token");
    playerId = sessionStorage.getItem("player_id");
    playerRole = sessionStorage.getItem("player_role");
    gameId = sessionStorage.getItem("game_id");

    fetch(`${HOST}/api/tickets/${gameId}`, {
        method: "GET",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
        .then(response => response.json())
        .then(res => {
            ticket = res.ticket;

            lobby.style.display = "none";
            game.style.display = "flex";
            info.style.display = "flex";
        })
        .then(() => {
            ws = new WebSocket(`${HOST}/api?t=${ticket}`);

            ws.onopen = e => {
                console.log("connection open");
                ws.send(fmt(14));
                ws.send(fmt(12));
            };

            ws.onerror = e => console.log("WebSocket Error: " + e);

            ws.onclose = e => console.log("connection close");

            ws.onmessage = e => handleMessage(JSON.parse(e.data));
        })
}



// HANDLERS

function handleMessage(message) {

    switch (message.type) {
        case "ICE":
            rtcConfig = message.payload
            break;

        case "RTC":
            handlePeer(message.payload)
            console.log(message);

            break;

        case "DATA":
            handleData(message.payload);
            break;

        default:
            console.log(message);

            break;
    }
}




function handleData(data) {




    disableColors(data.players);
    drawPlayersList(data.players);
    drawPlayersChip(data.players);
    setCurrentPlayer(data.players);
    redrawPlayerInfo(data);
    setAction(data);

    // setupRTC(data.players);
    scanPeers(data.players);

    setVideoStreams(data.players)

    gameData = data;
    console.log(gameData);
}

function drawPlayersList(players) {

    let html = "";

    players.forEach(player => {
        if (player.is_admin === 0 && player.avatar) {
            html += `<div class="players-list-item" id="${player.id}-list"><div class="players-color" style="background-color: ${player.avatar.color};"><h2>${player.position}</h2></div><p>${player.avatar.name}</p></div>`;
        }
    })

    playersList.innerHTML = html;

    players.forEach(player => {
        if (player.is_admin === 0 && player.avatar) {
            document.getElementById(`${player.id}-list`).addEventListener("click", drawPlayerInfo, { bubbles: true })
        }
    })
}

function drawPlayersChip(players) {
    try {
        for (let i = 1; i <= 72; i++) {
            document.getElementById(i).innerHTML = ""
        }

        players.forEach(player => {

            if (player.is_admin === 0 && player.avatar && player.position > 0 && player.position <= 72) {
                const chip = `<div id="${player.id}-chip" class="chip" style="background-color: ${player.avatar.color};"></div>`
                document.getElementById(player.position).innerHTML += chip
            }
        })
    } catch (e) {
        console.log(e);

    }


}

function handleAction() {

    console.log(gameData.game.status);


    switch (gameData.game.status) {
        case "lobby":
            if (playerRole === "admin") {
                ws.send(fmt(24))
            } else {
                // ws.send(fmt(30))
            }
            break;

        case "ready_dice":
            if (playerRole === "admin") {
                // console.log("ready_dice admin");
                ws.send(fmt(20))
            } else {
                ws.send(fmt(30))
            }
            break;

        case "ready_move":
            if (playerRole === "admin") {
                ws.send(fmt(21))
            } else {
                ws.send(fmt(31))
            }
            break;

        case "ready_turn":
            if (playerRole === "admin") {
                ws.send(fmt(22))
            } else {
                // ws.send(fmt(30))
            }
            break;

        default:
            break;
    }
}

function setAction(data) {

    startImg.style.display = "none";
    diceImg.style.display = "none";
    moveImg.style.display = "none";
    nextImg.style.display = "none";

    switch (data.game.status) {
        case "lobby":
            startImg.style.display = "block";
            break;

        case "ready_dice":
            diceImg.style.display = "block";
            break;

        case "ready_move":
            moveImg.style.display = "block";
            break;

        case "ready_turn":
            nextImg.style.display = "block";
            break;

        default:
            break;
    }
}

function setCurrentPlayer(players) {
    players.forEach(player => {
        if (player.status === "active") {
            currentColor.style.backgroundColor = player.avatar.color;
            currentPosition.innerText = player.position;
            currentName.innerText = player.avatar.name;
            currentRequest.innerText = player.request;

            return;
        }
    })
}

function disableColors(players) {
    players.forEach(player => {

        try {

            if (player.avatar) {

                if (player.request) {
                    player.request = JSON.parse(player.request)
                }

                player.avatar = JSON.parse(player.avatar);

                if (player.is_admin === 0 && player.avatar.color) {

                    let color;

                    switch (player.avatar.color) {
                        case "#B659A2":
                            color = "violet"
                            break;

                        case "#676BB1":
                            color = "purple"
                            break;

                        case "#3EB2E6":
                            color = "blue"
                            break;

                        case "#A2CE47":
                            color = "green"
                            break;

                        case "#FED548":
                            color = "yellow"
                            break;

                        case "#F38334":
                            color = "orange"
                            break;

                        case "#EF3A44":
                            color = "red"
                            break;

                        default:
                            break;
                    }


                    document.getElementById(color).parentElement.style.display = "none";
                }
            }
        } catch (e) {
            console.log(e);

        }

    })
}

function setAvatar() {

    document.body.style.overflow = "hidden"


    avatarInputs.style.display = "flex";

    submitAvatar.addEventListener("click", () => {

        playerAvatarName = avatarName.value;
        playerAvatarRequest = avatarRequest.value;
        const color = document.querySelector(`input[name="color"]:checked`).value;

        if (ws.readyState === 1) {

            console.log(JSON.stringify({ name: playerAvatarName, color: color }));

            ws.send(fmt(33, [JSON.stringify({ name: playerAvatarName, color: color })]));
            ws.send(fmt(32, [JSON.stringify(playerAvatarRequest)]));

            avatarInputs.style.display = "none";

            document.body.style.overflow = "";
        }
    })
}

function drawPlayerInfo(e) {

    try {
        const id = e.target.closest(".players-list-item").id.slice(0, -5)

        selectedPlayer = id;

        const player = gameData.players.find(player => player.id === id);

        // console.log(player);
        // console.log(id);



        let history = ""

        gameData.history.forEach(i => {
            if (i.player_id === id) {
                history += `<div class="history-item">${i.end}</div>`
            }
        })

        playerName.innerText = player.avatar.name;
        playerColor.innerText = player.avatar.color;
        playerStatus.innerText = player.status;
        playerRequest.innerText = player.request;
        playerPosition.innerText = player.position;
        playerDice.innerText = player.dice;

        playerHistory.innerHTML = history;

    } catch (e) {
        console.log(e);
    }
}

function redrawPlayerInfo(data) {



    const player = data.players.find(player => player.id === selectedPlayer);
    // console.log(player);

    if (!player) return;

    let history = "";

    data.history.forEach(i => {
        if (i.player_id === selectedPlayer) {
            history += `<div class="history-item">${i.end}</div>`
        }
    })

    // console.log(history);


    playerName.innerText = player.avatar.name;
    playerColor.innerText = player.avatar.color;
    playerStatus.innerText = player.status;
    playerRequest.innerText = player.request;
    playerPosition.innerText = player.position;
    playerDice.innerText = player.dice;

    playerHistory.innerHTML = history;

}

async function copyLink() {
    const url = `${window.location.href}?game=${gameId}`;

    try {
        await navigator.clipboard.writeText(url);
        console.log(url);
    } catch (e) {
        console.log(e);
    }
}

function getGameIdFromUrl() {
    const id = new URLSearchParams(window.location.search).get("game");

    if (!id) {
        return;
    } else {
        gameIdInput.value = id;
        gameIdInput.dispatchEvent(new Event("change", { bubbles: true }));
        // playerJoin()
        return
    }
}

async function setupRTC(players) {

    if (!isFirstRtc) return;

    isFirstRtc = false;

    const pc = new RTCPeerConnection(rtcConfig);



    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });

    const localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });

    mediaStreams.set(playerId, localStream);

    adminVideo.srcObject = mediaStreams.get(playerId);

    peerConnections.set(playerId, pc)

    players.forEach(player => {
        if (!peerConnections.has(player.id) && player.id !== playerId) {

            console.log(player.id);

            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => {
                    ws.send(fmt(13, { target: player.id, payload: pc.localDescription }))
                })
        }
    });


}

const fmt = (code, values = []) => JSON.stringify({ code, values });


// RTC

let rtcConfig = {}
let isFirstRtc = true

const peers = new Map();
const streams = new Map();



function scanPeers(players) {

    if (!isFirstRtc) return;

    isFirstRtc = false;

    players.forEach(player => {
        if (!peers.has(player.id) && player.id !== playerId) {
            createPeer(player.id)
        }
    })
}

async function createPeer(peerPlayerId) {
    const localStream = streams.get("localStream");
    const pc = new RTCPeerConnection(rtcConfig);
    // console.log("create peer");
    //const channel = pc.createDataChannel("channel");

    //channel.onopen = () => console.log("channel is open");



    const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });



    audioTransceiver.sender.replaceTrack(localStream.getAudioTracks()[0]);
    videoTransceiver.sender.replaceTrack(localStream.getVideoTracks()[0]);

    pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
            console.log(pc.localDescription);

            ws.send(fmt(13, { target: peerPlayerId, payload: pc.localDescription }))
        })

    pc.onicecandidate = e => {
        setTimeout(() => {
            e.candidate.type = "ice-candidate"
            ws.send(fmt(13, { target: peerPlayerId, payload: e.candidate }))
        }, 500)
        // if (e.candidate === null) {
        //     ws.send(fmt(13, { target: peerPlayerId, payload: pc.localDescription.sdp }))
        //     console.log("ice candidates send");
        // }
        // console.log("new ice candidate");
    }

    peers.set(peerPlayerId, pc)
}

async function getLocalStream() {
    let localStream;
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }) // ENABLE AUDIO LATER
    streams.set("localStream", localStream);
    // adminVideo.srcObject = localStream;
    // console.log("get local stream");
}





async function handlePeer(message) {

    console.log(message);

    switch (message.payload.type) {
        case "offer":
            {
                //console.log("offer");



                let pc = new RTCPeerConnection(rtcConfig);

                peers.set(message.sender, pc)

                pc.ontrack = e => {
                    if (streams.has(message.sender)) {
                        streams.get(message.sender).addTrack(e.track);
                    } else {
                        stream = new MediaStream();
                        stream.addTrack(e.track);
                        streams.set(message.sender, stream);
                    }

                    ws.send(fmt(12));
                }

                pc.onicecandidate = e => {
                    setTimeout(() => {
                        if (e.candidate) {
                            ws.send(fmt(13, { target: message.sender, payload: e.candidate }))
                        }
                    }, 500)
                }

                await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
                console.log("setremotedescription");


                const transceivers = pc.getTransceivers();
                const audioTransceiver = transceivers.find(t => t.receiver.track.kind === 'audio');
                const videoTransceiver = transceivers.find(t => t.receiver.track.kind === 'video');

                try {
                    let localStream = streams.get("localStream")

                    console.log("replacetrack");

                    if (audioTransceiver) audioTransceiver.sender.replaceTrack(localStream.getAudioTracks()[0]);
                    if (videoTransceiver) videoTransceiver.sender.replaceTrack(localStream.getVideoTracks()[0]);

                    console.log("direction");

                    audioTransceiver.direction = "sendrecv";
                    videoTransceiver.direction = "sendrecv";
                } catch (e) {
                    console.log(e);
                }

                console.log("createanswer");

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                ws.send(fmt(13, { target: message.sender, payload: answer }))
            }
            break;

        case "answer":
            //console.log("answer");
            {
                await peers.get(message.sender).setRemoteDescription(new RTCSessionDescription(message.payload));

                const incomingStream = new MediaStream();

                peers.get(message.sender).getTransceivers().forEach(t => {
                    if (t.currentDirection === "sendrecv") {
                        const remoteTrack = t.receiver.track;

                        incomingStream.addTrack(remoteTrack)
                    }
                })

                console.log(incomingStream);


                streams.set(message.sender, incomingStream);

                ws.send(fmt(12));

            }
            break;

        default:
            //console.log("ice");

            try {
                await peers.get(message.sender).addIceCandidate(message.payload)
            } catch (e) {
                console.log(e);
            }
            break;
    }
}

function setVideoStreams(players) {



    if (playerRole === "admin") {

        adminVideo.srcObject = streams.get("localStream")

        let count = 2

        players.forEach(player => {

            if (player.id === playerId) {
                //
            } else if (player.status === "active") {
                video1.srcObject = streams.get(player.id)
            } else {
                //console.log(`${count}-video`);

                document.getElementById(`${count}-video`).srcObject = streams.get(player.id)
                count++
            }
        })

    } else {

        video1.srcObject = streams.get("localStream");

        let count = 2

        players.forEach(player => {

            if (player.id === playerId) {
                //
            } else if (player.is_admin === 1) {

                adminVideo.srcObject = streams.get(player.id)
            } else {
                //console.log(`${count}-video`);

                document.getElementById(`${count}-video`).srcObject = streams.get(player.id)
                count++
            }
        })

    }
}



// MAIN

getGameIdFromUrl();
getLocalStream();














// lobby.style.display = "flex";