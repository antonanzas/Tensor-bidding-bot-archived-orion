const anchor = require("@project-serum/anchor");
const web3 = require("@solana/web3.js");
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const { conn, keypair} = require("../common_c");
const { BN } = require("@coral-xyz/anchor");
const { tx_confirm} = require("../tx_confirm");
const { Transaction, PublicKey, ComputeBudgetProgram } = web3;

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });


async function pool_close(config,publicKey,whitelist){

  var tx_confirmed = false

  while(tx_confirmed == false) {

    const detach = await swapSdk.detachPoolMargin({
      config: config,
      marginNr: 0,
      owner: publicKey,
      amount: new BN(0),
      whitelist: new PublicKey(whitelist),
    })

    const closePool = await swapSdk.closePool({
      owner: publicKey,
      whitelist: new PublicKey(whitelist),
      config: config,
    })

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
      units: 300000 
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: 25000
    });

    const transaction = new Transaction().add(modifyComputeUnits).add(addPriorityFee).add(...detach.tx.ixs).add(...closePool.tx.ixs);
    //console.log(transaction);

    let txHash = null
    let try1 = 1
    let contador_back  = 5

    while (try1 > 0){
      contador_back  = contador_back  - 1
      if (contador_back  > 0 ) {
        try{
          // construct transaction
          const blockhash = await conn.getLatestBlockhash().then((res) => res.blockhash);
          transaction.recentBlockhash = blockhash;
          transaction.sign(keypair);
          //console.log(transaction);

          //uncomment the following fields if you want to actually execute the transaction
          txHash = await conn.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed"
          });
          console.log("\x1b[36m"+ "(Pool close)" + "\x1b[0m" + " Sent with hash: " + txHash);
          try1 = try1 - 1

        } catch(error){
          console.log( "\x1b[31m"+ "Error ocurred in tx simulation: ", error  + "\x1b[0m")
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      else {
        try1 = try1-1
      }
    }

    tx_confirmed = await tx_confirm(txHash)

    if (tx_confirmed == true){
      console.log("Tx confirmed: " + txHash)
    }

  }
}

module.exports = {pool_close}