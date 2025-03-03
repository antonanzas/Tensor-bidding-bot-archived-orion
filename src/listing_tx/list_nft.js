const anchor = require("@project-serum/anchor");
const web3 = require("@solana/web3.js");
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const { conn, keypair} = require("../common_c");
const { BN } = require("@coral-xyz/anchor");
const { Transaction, PublicKey, ComputeBudgetProgram} = web3;
const splToken = require("@solana/spl-token");
const { tx_confirm} = require("../tx_confirm");


const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });

async function list_nft(price, keypair, nft){
  console.log("Listing: " + nft + "....")
  var tx_confirmed = false
  nft = new PublicKey(nft)
  const associatedTokenAddress = await splToken.getAssociatedTokenAddress(nft,keypair.publicKey);

  while(tx_confirmed == false) {
    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
      units: 700000 
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: 25000
    });
    
    const data = await swapSdk.list({
        owner: keypair.publicKey,
        nftMint: nft,
        nftSource:associatedTokenAddress,
        price: new BN(price),
      });
        
    const transaction = new Transaction().add(modifyComputeUnits).add(addPriorityFee).add(data.tx.ixs[2]);

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
          console.log("\x1b[34m"+ "(Nft list)" + "\x1b[0m" + " Sent with hash: "+ txHash);
          try1 = try1 -1
          
        } catch(error) {
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
      return "Tx confirmed: " + txHash
    }
  }
}

module.exports = {list_nft}