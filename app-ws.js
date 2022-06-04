var WebSocketServer = require('websocket').server;
var http = require('http');
var server = http.createServer(function(request,response){
    response.writeHead(200, {'Content-Type': 'text/plain'});
    response.end("This is the node.js HTTP server.");
});
var wsServer = new WebSocketServer({
    httpServer:server,
    autoAcceptConnections: false        
});

// Initialize a set of rooms
var gameRooms = [];
for (var i=0; i < 10; i++) {
    gameRooms.push({status:"empty",players:[],roomId:i+1});

};

console.log(gameRooms.map((i) => {
    i.status
}));

var players = [];
wsServer.on('request',function(request){
    if(!connectionIsAllowed(request)){
        request.reject();
        console.log('Connection from ' + request.remoteAddress + ' rejected.');
        return;
    }
    
    var connection = request.accept();
    console.log('Connection from ' + request.remoteAddress + ' accepted.');
    
    // Add the player to the players array
    var player = {
        connection:connection,
        latencyTrips:[]    
    }

    players.push(player);
    
    // Measure latency for player
    measureLatency(player);

    // Send a fresh game room status list the first time player connects
    sendRoomList(connection);

	// On Message event handler for a connection
	connection.on('message', function(message) {
	    if (message.type === 'utf8') {
	        var clientMessage = JSON.parse(message.utf8Data);
	        switch (clientMessage.type){
	            case "join_room":
	                var room = joinRoom(player,clientMessage.roomId);
	                sendRoomListToEveryone();
	                if(room.players.length == 2){
	                    initGame(room);
	                }
	                break;                
	            case "leave_room":
	                leaveRoom(player,clientMessage.roomId);
	                sendRoomListToEveryone();
	                break;
	            case "initialized_level":
	                player.room.playersReady++;
	                if (player.room.playersReady==2){
	                    startGame(player.room);
	                }
	                break;     
                case "latency_pong":
                    finishMeasuringLatency(player,clientMessage);
                    // Measure latency atleast thrice
                    if(player.latencyTrips.length<3){
                        measureLatency(player);
                    }
                    break;    
	            case "command":
	                if (player.room && player.room.status=="running"){
	                    if(clientMessage.uids){
	                        player.room.commands.push({uids:clientMessage.uids, details:clientMessage.details});
	                    }                    
	                    player.room.lastTickConfirmed[player.color] = clientMessage.currentTick + player.tickLag;
	                }
	                break;    
				case "lose_game":
					endGame(player.room, "The "+ player.color +" team has been defeated.");                
					break;
				case "chat":
					if (player.room && player.room.status=="running"){
						var cleanedMessage = clientMessage.message.replace(/[<>]/g,"");
					   	sendRoomWebSocketMessage(player.room,{type:"chat", from:player.color, message:cleanedMessage});
						console.log(clientMessage.message,"was cleaned to",cleanedMessage)
					}
					break;                                                                                                                                                                             
	        }
	    }
	});
    
    connection.on('close', function(reasonCode, description) {
	    console.log('Connection from ' + request.remoteAddress + ' disconnected.');

	    for (var i = players.length - 1; i >= 0; i--){
	        if (players[i]==player){
	            players.splice(i,1);
	        }
	    };

	    // If the player is in a room, remove him from room and notify everyone
	    if(player.room){
	        var status = player.room.status;
	        var roomId = player.room.roomId;
	        // If the game was running, end the game as well            
	        if(status=="running"){                
	            endGame(player.room, "The "+ player.color +" player has disconnected.");                
	        } else {
	            leaveRoom(player,roomId);
	        }            
	        sendRoomListToEveryone();            
	    }

	});
});

function sendRoomList(connection){
    var status = [];
    for (var i=0; i < gameRooms.length; i++) {
        status.push(gameRooms[i].status);
    };
    var clientMessage = {type:"room_list",status:status};
    connection.send(JSON.stringify(clientMessage));
}

function sendRoomListToEveryone(){
    // Notify all connected players of the room status changes
    var status = [];
    for (var i=0; i < gameRooms.length; i++) {
        status.push(gameRooms[i].status);
    };
    var clientMessage = {type:"room_list",status:status};
    var clientMessageString = JSON.stringify(clientMessage);
    for (var i=0; i < players.length; i++) {
        players[i].connection.send(clientMessageString);
    };
}

function joinRoom(player,roomId){
    var room = gameRooms[roomId-1];
    console.log("Adding player to room",roomId);
    // Add the player to the room
    room.players.push(player);
    player.room = room;        
    // Update room status 
    if(room.players.length == 1){
        room.status = "waiting";
        player.color = "blue";
    } else if (room.players.length == 2){
        room.status = "starting";
        player.color = "green";
    }
    // Confirm to player that he was added
    var confirmationMessageString = JSON.stringify({type:"joined_room", roomId:roomId, color:player.color});
    player.connection.send(confirmationMessageString);
    return room;
}

function leaveRoom(player,roomId){
    var room = gameRooms[roomId-1];
    console.log("Removing player from room",roomId);
     
    for (var i = room.players.length - 1; i >= 0; i--){
        if(room.players[i]==player){
            room.players.splice(i,1);
        }
    };
    delete player.room;
    // Update room status 
    if(room.players.length == 0){
        room.status = "empty";    
    } else if (room.players.length == 1){
        room.status = "waiting";
    }
}


function sendRoomWebSocketMessage(room,messageObject){
    var messageString = JSON.stringify(messageObject);
    for (var i = room.players.length - 1; i >= 0; i--){
        room.players[i].connection.send(messageString);
    }; 
}

function measureLatency(player){
    var connection = player.connection;    
    var measurement = {start:Date.now()};
    player.latencyTrips.push(measurement);
    var clientMessage = {type:"latency_ping"};
    connection.send(JSON.stringify(clientMessage));
}
function finishMeasuringLatency(player,clientMessage){
    var measurement = player.latencyTrips[player.latencyTrips.length-1];
    measurement.end = Date.now();
    measurement.roundTrip = measurement.end - measurement.start;
    player.averageLatency = 0;
    for (var i=0; i < player.latencyTrips.length; i++) {
        player.averageLatency += measurement.roundTrip/2;
    };
    player.averageLatency = player.averageLatency/player.latencyTrips.length;
    player.tickLag = Math.round(player.averageLatency * 2/100)+1;     
    console.log("Measuring Latency for player. Attempt", player.latencyTrips.length, "- Average Latency:",player.averageLatency, "Tick Lag:", player.tickLag);
}
