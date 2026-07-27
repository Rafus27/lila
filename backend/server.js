const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { randomUUID, createHmac } = require("crypto");
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
require('dotenv').config();


const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES;
const COTURN_SECRET = process.env.COTURN_SECRET;
const COTURN_REALM = process.env.COTURN_REALM;

db.exec(`
CREATE TABLE games (
	id TEXT PRIMARY KEY,
	status TEXT,
	step INTEGER DEFAULT 0,
	queue TEXT,
	created_at INT DEFAULT (unixepoch('now'))
  
	CHECK(status IN ('not_ready', 'lobby', 'ready_dice', 'ready_move', 'ready_turn', 'move', 'pause', 'end'))
) STRICT;

CREATE TABLE users (
	id TEXT PRIMARY KEY,
  	game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
  	is_admin INT DEFAULT 0,
  	status TEXT,
  	net_status TEXT,
  	avatar TEXT,
  	request TEXT,
  	queue_priority INT,
  	position INT,
  	dice INT,
  	last_not_six INT,
  	six_counter INT,
  	one_counter INT,
  
  	CHECK(status IN ('ready', 'not_ready', 'start', 'active', 'end'))
  	CHECK(net_status IN ('online', 'offline', 'disconnect', 'reconnect'))
) STRICT;

CREATE UNIQUE INDEX unique_admin_idx ON users(game_id) WHERE is_admin = 1;
CREATE UNIQUE INDEX unique_active_idx ON users(game_id) WHERE status = 'active';

CREATE TABLE tickets (
	ticket TEXT PRIMARY KEY,
	user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
	user_is_admin TEXT,
	game_id TEXT REFERENCES games(id) ON DELETE CASCADE
) STRICT;

CREATE TABLE move_history (
	player_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  	type TEXT,
  	step INT,
  	start INT,
  	end INT,
  	info TEXT,
  
  	PRIMARY KEY (player_id, step)
) STRICT;

CREATE TABLE cards (
	id INTEGER PRIMARY KEY,
  	deck TEXT,
  	number INT,
  	content TEXT,
  
  	CONSTRAINT uc_card UNIQUE(deck, number)
) STRICT;

CREATE TABLE card_history (
	player_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  	card_id INTEGER REFERENCES cards(id) ON DELETE CASCADE
) STRICT;
    `);


class AppError {

    constructor(status, message) {
        this.status = status;
        this.message = message || this.codes.get(status);
    }

    codes = new Map([
        [400, "Bad Request"],
        [401, "Unauthorized"],
        [403, "Forbidden"],
        [404, "Not Found"],
        [405, "Method Not Allowed"],
        [500, "Internal Server Error"]
    ])
}

class Event {
    constructor(code, init, ws, values) {
        this.code = code;
        this.init = init;
        this.ws = ws;
        this.values = values;
    }
}

class UserController {
    constructor(db) {
        this.db = db;
    }

    createUser(userRole) {
        try {
            const isAdmin = userRole === "admin" ? 1 : 0;
            const id = randomUUID();
            this.db.prepare(`INSERT INTO users ( id, is_admin, status, net_status, position ) VALUES ( ?, ?, ?, ?, 0)`).run(id, isAdmin, "not_ready", "offline");
            return id;
        } catch (e) {
            eLog("CREATE_USER", e);
        }
    }

    deleteUser(userId) {
        try {
            this.db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
        } catch (e) {
            eLog("DELETE_USER", e);
        }
    }

    getUserData(userId) {
        try {
            return this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
        } catch (e) {
            eLog("GET_USER_DATA", e);
        }
    }

    setUserData(userId, column, value) {
        try {
            // console.log(userId);
            // console.log(column);
            // console.log(value);

            this.db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(value, userId);
        } catch (e) {
            eLog("SET_USER_DATA", e);
        }
    }

    getTicket(userId, userRole, gameId) {
        try {
            //console.log(userId, userRole, gameId);
            
            const ticket = randomUUID().slice(0, 8);
            const isAdmin = userRole === "admin" ? 1 : 0;
            this.db.prepare(`INSERT INTO tickets (ticket, user_id, user_is_admin, game_id) VALUES (?, ?, ?, ?)`).run(ticket, userId, isAdmin, gameId);
            this.db.prepare(`UPDATE users SET game_id = ? WHERE id = ?`).run(gameId, userId);
            Games.broadcast(gameId);
            setTimeout(() => this.db.prepare(`DELETE FROM tickets WHERE ticket = ?`).run(ticket), 30_000);
            return ticket;
        } catch (e) {
            eLog("GET_TICKET", e);
        }
    }

    checkTicket(ticket) {
        try {
            const data = this.db.prepare(`SELECT * FROM tickets WHERE ticket = ?`).get(ticket);
            if (data.ticket) {
                this.db.prepare(`DELETE FROM tickets WHERE ticket = ?`).run(ticket);
                return data;
            }
        } catch (e) {
            eLog("CHECK_TICKET", e);
        }
    }

    setSocket(ticket, ws) {
        try {
            const user = {
                id: ticket["user_id"],
                isAdmin: ticket["user_is_admin"],
                game: ticket["game_id"]
            }

            ws.user = user;
        } catch (e) {
            eLog("SET_SOCKET", e);
        }
    }

    addMove(playerId, type, end, info) {
        try {
            //console.log(playerId);

            //console.log("end position: " + end);


            const player = Users.getUserData(playerId);
            //console.log(player);

            const game = Games.getGameData(player.game_id);
            //console.log(game);



            this.db.prepare(`INSERT INTO move_history (player_id, type, step, start, end, info) VALUES (?, ?, ?, ?, ?, ?)`).run(playerId, type, game["step"], player["position"], end, info);
            this.setUserData(playerId, "position", end);
            Games.increaseStep(game.id);

        } catch (e) {
            eLog("ADD_MOVE", e);
        }
    }


}

class GameController {
    constructor(db) {
        this.db = db;
    }

    createGame() {
        try {
            const id = randomUUID();
            this.db.prepare(`INSERT INTO games (id, status) VALUES (?, ?)`).run(id, "not_ready");
            return id;
        } catch (e) {
            eLog("CREATE_GAME", e);
        }
    }

    deleteGame(gameId) {
        try {
            this.db.prepare(`DELETE FROM games WHERE id = ?`).run(gameId);
        } catch (e) {
            eLog("DELETE_GAME", e);
        }
    }

    getGameData(gameId) {
        try {
            return this.db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId);
        } catch (e) {
            eLog("GET_GAME_DATA", e);
        }
    }

    setGameStatus(gameId, gameStatus) {
        try {
            this.db.prepare(`UPDATE games SET status = ? WHERE id = ?`).run(gameStatus, gameId);
        } catch (e) {
            eLog("SET_GAME_STATUS", e);
        }
    }

    increaseStep(gameId) {
        try {
            const step = this.db.prepare(`SELECT step FROM games WHERE id = ?`).get(gameId);

            this.db.prepare(`UPDATE games SET step = ? WHERE id = ?`).run(++step.step, gameId);

        } catch (e) {

        }
    }

    getSnapshot(gameId) {
        // try {
        let game = this.db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId);
        if (!game) {
            game = {}
        }
        let players = this.db.prepare(`SELECT * FROM users WHERE game_id = ?`).all(gameId);
        if (!players) {
            players = {}
        }
        let history = this.db.prepare(`SELECT move_history.* FROM move_history INNER JOIN users ON move_history.player_id = users.id WHERE users.game_id = ?`).all(gameId);
        if (!history) {
            history = {}
        }

        return { game, players, history };
        // } catch (e) {
        //     eLog("GET_SNAPSHOT");
        // }
    }

    broadcast(gameId) {
        try {
            const snapshot = this.getSnapshot(gameId);

            wss.clients.forEach(ws => {
                if (ws.user.game === gameId && ws.isAlive === true) {
                    ws.send(fmt("DATA", snapshot));
                    //console.log({user: ws.user, snapshot});

                }
            })
        } catch (e) {
            eLog("BROADCAST", e);
        }
    }

    getAdmin(gameId) {
        try {
            return this.db.prepare(`SELECT * FROM users WHERE game_id = ? AND is_admin = 1`).get(gameId);
        } catch (e) {
            eLog("IS_ADMIN_EXIST", e);
        }
    }

    getPlayers(gameId) {
        try {
            return this.db.prepare(`SELECT * FROM users WHERE game_id = ?`).all(gameId);
        } catch (e) {
            eLog("GET_PLAYERS", e);
        }
    }

    setActivePlayer(gameId, playerId) {
        try {
            this.db.prepare(`UPDATE users SET status = 'ready' WHERE game_id = ? AND status = 'active'`).run(gameId);
            this.db.prepare(`UPDATE users SET status = 'active' WHERE id = ? AND status != 'end'`).run(playerId);
        } catch (e) {
            eLog("SET_QUEUE", e);
        }
    }

    getActivePlayer(gameId) {
        try {
            return this.db.prepare(`SELECT * FROM users WHERE game_id = ? AND status = 'active'`).get(gameId);
        } catch (e) {
            eLog("GET_PLAYERS", e);
        }
    }

    setQueue(gameId, queue) { // not ready
        try {
            // console.log("set queue");

            // console.log(gameId);
            //console.log("setqueue queue: " + queue);


            this.db.prepare(`UPDATE games SET queue = ? WHERE id = ?`).run(JSON.stringify(queue), gameId);
        } catch (e) {
            eLog("SET_QUEUE", e);
        }
    }

    getAutoQueue(gameId) {
        try {
            const arr = this.db.prepare(`SELECT id FROM users WHERE game_id = ? AND is_admin = 0 AND status != 'end' AND position != 68`).all(gameId);
            let res = [];
            arr.forEach(i => res.push(i.id));
            //console.log("autoqueue: " + res);

            return res;
        } catch (e) {
            eLog("SET_QUEUE", e);
        }
    }

    rollDice(dice = 0) {
        if (dice === 0) {
            let a = new Uint32Array(1);
            crypto.getRandomValues(a);
            return 1 + (a[0] % 6);
        } else {
            return 1 + (dice % 6);
        }
    }

    jump(pos) {
        const warp = new Map([
            [10, 23],
            [16, 4],
            [20, 32],
            [24, 7],
            [28, 50],
            [37, 66],
            [45, 67],
            [52, 35],
            [55, 3],
            [63, 2],
            [12, 8],
            [17, 69],
            [22, 60],
            [27, 41],
            [29, 6],
            [44, 9],
            [46, 62],
            [54, 68],
            [61, 13],
            [72, 51],
            //[68, 0],
        ]);

        if (warp.has(pos)) {
            return warp.get(pos);
        } else {
            return pos;
        }
    }
}

class EventHandler {
    constructor(db) { }

    handleMessage(m, ws) {

        try {
            const message = JSON.parse(m);

            const event = new Event(message.code, ws.user, ws, message.values);

            // console.log(event);


            this.handle(event);
        } catch (e) {
            eLog("HANDLE_MESSAGE", e);
        }


    }

    handle(event) {

        if (event.code < 20) {

            switch (event.code) {
                case 10: // leave
                    Users.deleteUser(event.init.id);
                    event.ws.terminate();
                    Games.broadcast(event.init.game);
                    break;

                case 11: // disconnect
                    Users.setUserData(event.init.id, "net_status", "disconnect");
                    Users.setUserData(event.init.id, "status", "not_ready");
                    Games.broadcast(event.init.game);
                    break;

                case 12: // get_snapshot
                    this.responseSend(event.ws, Games.getSnapshot(event.init.game));
                    break;

                case 13: // signaling server

                    //console.log(event.values);

                    wss.clients.forEach(ws => {

                        if (ws.user.id === event.values.target) {
                            ws.send(fmt("RTC", { sender: event.init.id, payload: event.values.payload }))
                            //break;
                        }
                    })
                    break;

                case 14: // ice servers

                    {
                        const username = `${Date.now() + 86000}:${event.init.id}`

                        event.ws.send(fmt("ICE", {
                            iceServers: [
                                {
                                    urls: `stun:${COTURN_REALM}:3478`,
                                },
                                {
                                    urls: `turn:${COTURN_REALM}:3478`,
                                    username,
                                    credential: createHmac("sha1", COTURN_SECRET).update(username).digest("base64")
                                }
                            ],
                            //iceTransportPolicy: "relay"
                        }))
                    }

                    break;

                default:
                    this.errorSend(event.ws, "Bad Request");
                    break;
            }

        } else if (event.code < 30) {

            // console.log(event.init);


            if (event.init.isAdmin !== "1.0") {
                this.errorSend(event.ws, "Forbidden");
                return;
            }



            switch (event.code) {
                case 20: // dice
                    {
                        const game = Games.getGameData(event.init.game);
                        const activePlayer = Games.getActivePlayer(event.init.game);

                        //console.log(activePlayer);

                        if (game["status"] === "ready_dice" && activePlayer.position === 0) {
                            const dice = Games.rollDice(event.values[0]);
                            Users.setUserData(activePlayer.id, "dice", Games.rollDice(event.values[0]));

                            if (dice === 6) {
                                Games.setGameStatus(event.init.game, "ready_turn");
                                Users.addMove(activePlayer.id, "dice", 1, `${activePlayer["dice"]}`);
                                //Users.setUserData(activePlayer.id, "dice", Games.rollDice(event.values[0]));
                            }

                            Games.broadcast(event.init.game);
                            break;
                        }

                        if (game["status"] === "ready_dice" && activePlayer.id) {
                            Users.setUserData(activePlayer.id, "dice", Games.rollDice(event.values[0]));
                            Games.setGameStatus(event.init.game, "ready_move");
                            Games.broadcast(event.init.game);
                        }
                        break;
                    }

                case 21: // move
                    {
                        const game = Games.getGameData(event.init.game);
                        let activePlayer = Games.getActivePlayer(event.init.game);

                        //let shift = 0;
                        let isDiceMove = false;
                        let pos = 0;


                        //console.log("active player position: " + activePlayer.position);
                        //console.log("after jump position: " + Games.jump(activePlayer.position));



                        if (activePlayer.position === Games.jump(activePlayer.position)) {
                            pos = activePlayer.position + activePlayer.dice;
                            if (pos > 72) {
                                pos = 72;
                            }
                            isDiceMove = true;
                        } else {
                            pos = Games.jump(activePlayer["position"]);
                        }

                        //console.log(activePlayer.dice);

                        //console.log("pos: " + pos);


                        if (game["status"] === "ready_move" && activePlayer.id) {
                            if (isDiceMove) {
                                Users.addMove(activePlayer.id, "dice", pos, `${activePlayer["dice"]}`);

                                if (pos === Games.jump(pos)) {
                                    Games.setGameStatus(event.init.game, "ready_turn");
                                } else {
                                    Games.setGameStatus(event.init.game, "ready_move");
                                }
                            } else {
                                Users.addMove(activePlayer.id, "jump", pos, "snake/ladder");
                                Games.setGameStatus(event.init.game, "ready_turn");
                            }

                            activePlayer = Games.getActivePlayer(event.init.game);

                            if(activePlayer.position === 68) {
                                Users.setUserData(activePlayer.id, "status", "end")
                            }

                            Games.broadcast(event.init.game);
                        }
                        break;
                    }

                case 22: // next
                    {
                        const game = Games.getGameData(event.init.game);
                        const activePlayer = Games.getActivePlayer(event.init.game);

                        let queue = JSON.parse(game["queue"]);
                        //console.log(queue);

                        if (queue.length === 0) {
                            Games.setQueue(event.init.game, Games.getAutoQueue(event.init.game));
                            queue = JSON.parse(Games.getGameData(event.init.game).queue);
                        }
                        //console.log(queue);



                        //console.log(queue);

                        //console.log(activeId);


                        //console.log("queue length: " + queue.length);




                        if (game["status"] === "ready_turn") {
                            const activeId = queue.shift(); //!
                            if (queue.length === 0) {
                                Games.setQueue(event.init.game, Games.getAutoQueue(event.init.game));
                            } else {
                                Games.setQueue(event.init.game, queue);
                            }
                            Games.setActivePlayer(event.init.game, activeId); //!
                            Games.setGameStatus(event.init.game, "ready_dice");

                            Games.broadcast(event.init.game);
                        }
                        break;
                    }

                case 23: // lobby
                    {
                        const game = Games.getGameData(event.init.game);

                        //console.log(game);


                        if (game["status"] === "not_ready") {
                            Games.setGameStatus(event.init.game, "lobby");
                            Games.broadcast(event.init.game);
                        }
                        break;
                    }

                case 24: // start
                    {
                        const game = Games.getGameData(event.init.game);

                        if (game["status"] === "lobby") {
                            // Games.setQueue(event.init.game, Games.getAutoQueue(event.init.game))

                            // const game = Games.getGameData(event.init.game);

                            // const queue = JSON.parse(game["queue"]);
                            // const activeId = queue.shift();

                            const queue = Games.getAutoQueue(event.init.game);
                            const activeId = queue.shift();

                            Games.setQueue(event.init.game, queue);

                            Games.setActivePlayer(event.init.game, activeId); Games.setGameStatus(event.init.game, "ready_dice");
                            Games.broadcast(event.init.game);
                        }
                        break;
                    }

                case 25: // pause_game DEPRECATED
                    break;

                case 26: // close_game DEPRECATED

                    break;

                case 27: // ban DEPRECATED
                    Users.deleteUser(event.values[0]);
                    Games.broadcast(event.init.game);
                    break;

                case 28: // set_player_position
                    Users.setUserData(event.values[0], "position", event.values[1]);
                    Games.broadcast(event.init.game);
                    break;

                default:
                    this.errorSend(event, "Bad Request");
                    break;
            }

        } else if (event.code < 40) {

            switch (event.code) {
                case 30: // dice
                    {
                        const game = Games.getGameData(event.init.game);
                        const activePlayer = Games.getActivePlayer(event.init.game);

                        if (game["status"] === "ready_dice" && activePlayer.position === 0 && activePlayer.id === event.init.id) {
                            const dice = Games.rollDice(event.values[0]);
                            Users.setUserData(activePlayer.id, "dice", Games.rollDice(event.values[0]));

                            if (dice === 6) {
                                Games.setGameStatus(event.init.game, "ready_turn");
                                Users.addMove(activePlayer.id, "dice", 1, `${activePlayer["dice"]}`);
                                //Users.setUserData(activePlayer.id, "dice", Games.rollDice(event.values[0]));
                            }

                            Games.broadcast(event.init.game);
                            break;
                        }

                        if (game["status"] === "ready_dice" && activePlayer.id === event.init.id) {
                            Users.setUserData(activePlayer.id, "dice", Games.rollDice(event.values[0]));
                            Games.setGameStatus(event.init.game, "ready_move");
                            Games.broadcast(event.init.game);
                        }
                        break;
                    }

                case 31: // move
                    {
                        const game = Games.getGameData(event.init.game);
                        const activePlayer = Games.getActivePlayer(event.init.game);

                        //let shift = 0;
                        let isDiceMove = false;
                        let pos = 0;

                        if (activePlayer.position === Games.jump(activePlayer.position)) {
                            pos = activePlayer.position + activePlayer.dice;
                            if (pos > 72) {
                                pos = 72;
                            }
                            isDiceMove = true;
                        } else {
                            pos = Games.jump(activePlayer["position"]);
                        }

                        if (game["status"] === "ready_move" && activePlayer.id === event.init.id) {
                            if (isDiceMove) {
                                Users.addMove(activePlayer.id, "dice", pos, `${activePlayer["dice"]}`);

                                if (pos === Games.jump(pos)) {
                                    Games.setGameStatus(event.init.game, "ready_turn");
                                } else {
                                    Games.setGameStatus(event.init.game, "ready_move");
                                }
                            } else {
                                Users.addMove(activePlayer.id, "jump", pos, "snake/ladder");
                                Games.setGameStatus(event.init.game, "ready_turn");
                            }

                            Games.broadcast(event.init.game);
                        }
                        break;
                    }

                case 32: // set_request
                    Users.setUserData(event.init.id, "request", event.values[0]);
                    Games.broadcast(event.init.game);
                    break;

                case 33: // set_avatar
                    Users.setUserData(event.init.id, "avatar", event.values[0]);
                    Games.broadcast(event.init.game);
                    break;

                default:
                    this.errorSend(event, "Bad Request");
                    break;
            }

        } else {
            this.errorSend(event, "Bad Request");
        }
    }

    errorSend(ws, message) {
        ws.send(fmt("ERROR", message));
    }

    responseSend(ws, message) {
        ws.send(fmt("DATA", message))
    }
}

const Users = new UserController(db);
const Games = new GameController(db);
const Events = new EventHandler(db);


// Functions

const eLog = (init, err) => console.log('\x1b[91m%s\x1b[0m', `${init} ERROR: ${err}`);
const fmt = (type, payload) => JSON.stringify({ type, payload });



// Servers

const app = express();
const wss = new WebSocket.Server({ noServer: true });
const server = new http.createServer(app);


// Express

app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();
})

app.post("/api/:role/auth", (req, res, next) => {
    try {
        const { role } = req.params;

        if (role === "admin" || role === "player") {
            const id = Users.createUser(role);
            const token = jwt.sign({ id, role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

            res.status(201).json({ token, id, role });
        } else {
            next(new AppError(404));
        }
    } catch (e) {
        next(new AppError(500));
    }
})

app.use((req, res, next) => {
    try {
        const auth = req.get("Authorization");

        if (auth && auth.startsWith("Bearer ")) {

            jwt.verify(auth.split(" ")[1], JWT_SECRET, (err, decoded) => {
                if (!err) {
                    req.user = decoded;
                    next();
                } else {
                    next(new AppError(401));
                }
            })
        } else {
            next(new AppError(401));
        }
    } catch (e) {
        next(new AppError(500));
    }
})

app.get("/api/tickets/:game", (req, res, next) => {
    try {
        const { game } = req.params;

        const ticket = Users.getTicket(req.user.id, req.user.role, game);

        res.status(200).json({ ticket });
    } catch (e) {
        next(new AppError(500));
    }
})

app.use("/api/admin", (req, res, next) => {
    try {
        if (req.user.role === "admin") {
            next();
        } else {
            next(new AppError(403));
        }
    } catch (e) {
        next(new AppError(500));
    }
})

app.post("/api/admin/games", (req, res, next) => {
    try {
        const gameId = Games.createGame();

        res.status(201).json({ gameId });
    } catch (e) {
        next(new AppError(500));
    }
})

app.use((err, req, res, next) => {
    eLog("EXPRESS", `${err.status} | ${err.message}`);
    res.status(err.status).send();
})


// WebSocket

server.on("upgrade", (req, socket, head) => {
    try {
        socket.on("error", e => eLog("WS", e));

        const params = new URL(req.url, `http://${req.headers.host}`).searchParams;

        const t = params.get("t");


        // console.log(t);

        const ticket = Users.checkTicket(t);

        //console.log(ticket);

        if (ticket.ticket) {
            wss.handleUpgrade(req, socket, head, ws => {
                Users.setSocket(ticket, ws);
                wss.emit("connection", ws, req);
            })
        }
    } catch (e) {
        eLog("WS", e);
    }
})

wss.on("connection", ws => {
    try {

        ws.isAlive = true;
        ws.on("error", e => eLog("WS", e));
        ws.on("pong", () => ws.isAlive = true);
        ws.on("message", m => Events.handleMessage(m, ws));

    } catch (e) {
        eLog("WS", e);
    }
})

setInterval(() => {
    wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
            Events.handle(new Event(11, ws.user, ws));
            ws.terminate();
        } else {
            ws.isAlive = false;
            ws.ping();
        }
    })
}, 30_000)


// Server

server.listen(PORT, console.log("Lila Server: listening on port 8080"));