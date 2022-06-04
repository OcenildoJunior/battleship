var multiplayer = {
    // Open multiplayer game lobby
    websocket_url:"ws://localhost:3000/",
    websocket:undefined,
	start:function(){
		game.type = "multiplayer";
		var WebSocketObject = window.WebSocket || window.MozWebSocket;
		if (!WebSocketObject){
			game.showMessageBox("Your browser does not support WebSocket. Multiplayer will not work.");
			return;
		}
		this.websocket = new WebSocketObject(this.websocket_url);
		this.websocket.onmessage = multiplayer.handleWebSocketMessage;
		// Display multiplayer lobby screen after connecting
		this.websocket.onopen = function(){			
			// Hide the starting menu layer
			$('.gamelayer').hide();
			$('#multiplayerlobbyscreen').show();	
		}
	
		this.websocket.onclose = function(){			
			multiplayer.endGame("Error connecting to server.");
		}
	
		this.websocket.onerror = function(){			
			multiplayer.endGame("Error connecting to server.");
		}
	},
    handleWebSocketMessage:function(message){
        var messageObject = JSON.parse(message.data);
        switch (messageObject.type){
            case "room_list":
                multiplayer.updateRoomStatus(messageObject.status);
                break;    
	        case "joined_room":
	            multiplayer.roomId = messageObject.roomId;
	            multiplayer.color = messageObject.color;
	            break;
	        case "init_level":
	            multiplayer.initMultiplayerLevel(messageObject);
	            break;
	        case "start_game":
	            multiplayer.startGame();
	            break;
	        case "latency_ping":
	            multiplayer.sendWebSocketMessage({type:"latency_pong"});
	            break;    
	        case "game_tick":
	            multiplayer.lastReceivedTick = messageObject.tick;
	            multiplayer.commands[messageObject.tick] = messageObject.commands;
	            break;  
	        case "end_game":
	            multiplayer.endGame(messageObject.reason);
	            break;                
           case "chat":
				game.showMessage(messageObject.from,messageObject.message);
				break;        
        }        
    },
    statusMessages:{
        'starting':'Game Starting',
        'running':'Game in Progress',
        'waiting':'Awaiting second player',
        'empty':'Open'
    },
    updateRoomStatus:function(status){
        var $list = $("#multiplayergameslist");
        $list.empty(); // remove old options
        for (var i=0; i < status.length; i++) {
            var key = "Game "+(i+1)+". "+this.statusMessages[status[i]];            
            $list.append($("<option></option>").attr("disabled",status[i]== "running"||status[i]== "starting").attr("value", (i+1)).text(key).addClass(status[i]).attr("selected", (i+1)== multiplayer.roomId));
        };    
    },
	join:function(){
	    var selectedRoom = document.getElementById('multiplayergameslist').value;
	    if(selectedRoom){            
	        multiplayer.sendWebSocketMessage({type:"join_room",roomId:selectedRoom});    
	        document.getElementById('multiplayergameslist').disabled = true;
	        document.getElementById('multiplayerjoin').disabled = true;        
	    } else {
	        game.showMessageBox("Please select a game room to join.");            
	    }
	}, 
	cancel:function(){
		// Leave any existing game room
		if(multiplayer.roomId){			
			multiplayer.sendWebSocketMessage({type:"leave_room",roomId:multiplayer.roomId});
			document.getElementById('multiplayergameslist').disabled = false;
			document.getElementById('multiplayerjoin').disabled = false;
			delete multiplayer.roomId;
			delete multiplayer.color;
			return;
		} else {
			// Not in a room, so leave the multiplayer screen itself
			multiplayer.closeAndExit();
		}
	},
	closeAndExit:function(){
		// clear handlers and close connection
		multiplayer.websocket.onopen = null;
		multiplayer.websocket.onclose = null;
		multiplayer.websocket.onerror = null;		
		multiplayer.websocket.close();
	
		document.getElementById('multiplayergameslist').disabled = false;
		document.getElementById('multiplayerjoin').disabled = false;		
		// Show the starting menu layer
		$('.gamelayer').hide();
	    $('#gamestartscreen').show();			
	},
	sendWebSocketMessage:function(messageObject){
	    this.websocket.send(JSON.stringify(messageObject));
	}};