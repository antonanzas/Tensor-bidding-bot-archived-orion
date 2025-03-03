const {conn} = require("./common_c");
const WebSocket = require('ws');

const WSS_ENDPOINT =  ""

async function monitorTx(address) {
    var messagesReceived = 0
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WSS_ENDPOINT);
  
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'signatureSubscribe',
            params: [
              address,
              {
                encoding: 'base64',
                commitment: 'confirmed',
              },
            ],
          })
        );
      };
  
      ws.onmessage = (evt) => {
        try {
          const buffer = evt.data;
          messagesReceived++;
          if (messagesReceived === 2) {
            resolve(buffer);
            ws.close();
          }
        } catch (e) {
          reject(e);
        }
      };
  
      ws.onerror = (error) => {
        reject(error);
      };
    });
}

async function waitForTxMessage(address, timeout) {
    try {
      const message = await Promise.race([
        monitorTx(address),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Tx timedout')), timeout)
        ),
      ]);
      return message;
    } catch (error) {
      throw error;
    }
}

async function tx_confirm(txHash){

    // console.log(txHash)

    // var signature = await conn.getSignatureStatuses([txHash])
    
    // console.log(signature)
    // console.log(signature.value)

    // if (signature.value[0] != null){
    //     return true
    // }

    const timeout = 125000; // 120 segundos
    var mensaje = undefined

    var mensaje = await waitForTxMessage(txHash, timeout)
        .catch((error) => {
            console.error(error.message + ": " + txHash );
            // Manejar el error de timeout o de WebSocket
    });

    if (mensaje == undefined){
        return false
    } else {
        return true
    }
}

//tx_confirm("5ZofwGhaFeaa7UxiHpVd3wY5ooDmREpsR5EndBUXFRwbnvG19uKrRrRhWYarzge84bA9xUUSLqW5mdcbdeFzg7C3")

module.exports = {tx_confirm}