'use strict';
var express = require("express");
var WebSocket = require("ws");
var bodyParser = require('body-parser');
var http_port = process.env.HTTP_PORT || 3001;//环境变量 HTTP服务器
var p2p_port = process.env.P2P_PORT || 6001;//环境变量 P2P服务器
var crypto = require("crypto");

var num = 0;
var blockchain = [];//blockchain

function hash(str) {
    return crypto
        .createHash("md5")
        .update(str)
        .digest("hex");
}

function make_a_block(data, pre_hash, index) {
    var hash_text = hash(data + pre_hash);
    var block = {
        pre_hash: pre_hash,
        index: index,
        data: data,
        hash: hash_text
    };
    return block;
}

//创世
function g() {
    var data = "Genesis";
    var hash_text = hash(data + "0");
    blockchain.push({
        pre_hash: "0",
        index: 0,
        data: data,
        hash: hash_text
    });
}

function add_a_block_to_blockchain(data) {
    var pre_hash = blockchain[blockchain.length - 1].hash;
    var block = make_a_block(data, pre_hash, blockchain.length)
    blockchain.push(block);
    return block;
}

function get_all_blocks() {
    return blockchain;
}

g();


var sockets = [];//节点连接库

var initHttpServer = () => {//控制节点的HTTP服务器  类似节点操作
    var app = express();
    app.use(bodyParser.json());

    app.get('/peers', (req, res) => {//获取显示网络中存在的节点，
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });

    app.post('/addPeer', (req, res) => {//请求添加新的节点{"peer" : "ws://localhost:6001"}
        connectToPeers([req.body.peer]);//添加新节点
        res.send([req.body.peer]);
    });

    app.get('/blocks/all', (req, res) => {
        res.json(blockchain);
    });

    app.post('/block', (req, res) => {//
        var data = req.body.data;
        var block = add_a_block_to_blockchain(data);
        broadcast(block);//广播
        res.send();
    });

    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));//监听端口
}

//---建立P2P网络
var initP2PServer = () => {//P2P websocket全双工  服务器
    var server = new WebSocket.Server({ port: p2p_port });
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);
};

var initConnection = (ws) => {//初始化连接
    sockets.push(ws);//压入已连接的节点堆栈
    initMessageHandler(ws);//信息处理
    initErrorHandler(ws);//错误状态处理
    write(ws, blockchain[blockchain.length-1]);//广播
    console.log('new peer:' + ws._socket.remoteAddress + ':' + ws._socket.remotePort)
};

var initMessageHandler = (ws) => {//同步信息处理
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        handleBlock(message);//写入blockchain
    });
};

var initErrorHandler = (ws) => {//错误信息处理
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url + " " + ws._socket.remoteAddress + ':' + ws._socket.remotePort);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

var handleBlock = (message) => {//同步区块链信息
    blockchain.push(message);
    broadcast(message);//向临近节点广播
};

var connectToPeers = (newPeers) => {//连接新节点  客户端
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};


var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));


initHttpServer();
initP2PServer();