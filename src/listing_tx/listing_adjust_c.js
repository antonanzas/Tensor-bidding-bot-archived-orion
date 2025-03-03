const anchor = require("@project-serum/anchor");
const web3 = require("@solana/web3.js");
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const { conn, keypair} = require("../common_c");
const { tx_confirm} = require("../tx_confirm");
const { BN } = require("@coral-xyz/anchor");
const { Transaction, PublicKey,ComputeBudgetProgram} = web3;

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });

async function list_adjust(new_price, keypair, nft){
  nft = new PublicKey(nft)
  var tx_confirmed = false

  while(tx_confirmed == false) {
    const data = await swapSdk.editSingleListing({
        owner: keypair.publicKey,
        nftMint: nft,
        price: new BN(new_price),
    });

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
      units: 15000 
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: 75000
    });
        
    const transaction = new Transaction().add(modifyComputeUnits).add(addPriorityFee).add(...data.tx.ixs);
    
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
          console.log("\x1b[35m"+ "(List edit)" + "\x1b[0m" + " Sent with hash: " + txHash);
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
    
    // tx confirmation
    tx_confirmed = await tx_confirm(txHash)

    if (tx_confirmed == true){
      return "Tx confirmed: " + txHash
    }
  }
}

module.exports = {list_adjust}