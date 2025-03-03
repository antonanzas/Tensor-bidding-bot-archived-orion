const anchor = require("@project-serum/anchor");
const web3 = require("@solana/web3.js");
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const { conn, keypair } = require("../common_c");
const { BN } = require("@coral-xyz/anchor");
const { tx_confirm} = require("../tx_confirm");
const { findPoolPDA, findTSwapPDA, poolTypeU8, curveTypeU8 } = require("@tensor-oss/tensorswap-sdk") 
const { LAMPORTS_PER_SOL, Transaction,ComputeBudgetProgram } = web3;

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });

async function edit_pool(new_price, publicKey, whitelist,config,n_nfts){
  var tx_confirmed = false

  while(tx_confirmed == false) {

    let txHash = null
    let try1 = 1
    let contador_up  = 0
    var starting_price =  new BN(new_price * LAMPORTS_PER_SOL)

    while (try1 > 0){
      if (contador_up  <= 5 ) {
        try{
          var new_config = {
            poolType: tensorswap.PoolTypeAnchor.Token,
            curveType: tensorswap.CurveTypeAnchor.Exponential,
            startingPrice: starting_price,
            delta: new BN(0),
            mmCompoundFees: true,
            mmFeeBps: null,
          }
          const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
            units: 100000 
          });
          
          const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
            microLamports: 51000
          });
      
          const pool_edit = await swapSdk.editPool({
              owner: publicKey,
              whitelist: whitelist,
              oldConfig: config,
                //(!) new config is OPTIONAL. If not passed, pool is edited IN PLACE.
              newConfig: new_config,
              isCosigned: null,
              maxTakerSellCount: n_nfts,
              mmCompoundFees: null,
          })
      
          const transaction = new Transaction().add(modifyComputeUnits).add(addPriorityFee).add(...pool_edit.tx.ixs);
          //console.log(transaction);
          // construct transaction
          const blockhash = await conn.getLatestBlockhash().then((res) => res.blockhash);
          transaction.recentBlockhash = blockhash;
          transaction.sign(keypair);
          
          txHash = await conn.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed"
          });
          console.log("\x1b[33m"+ "(Pool edit)" + "\x1b[0m" + " Sent with hash: " + txHash);

          //console.log(transaction);
            
          
          try1 = try1 - 1
          
        } catch(error){
          console.log( "\x1b[31m"+ "Error ocurred in tx simulation: ", error  + "\x1b[0m")
          await new Promise(resolve => setTimeout(resolve, 1000));
          contador_up += 1
          starting_price =  new BN((new_price * LAMPORTS_PER_SOL)+contador_up)
        }
      }
      else {
        try1 = try1-1
      }
    }

    const [tswapPda, tswapBump] = findTSwapPDA({});
    const [poolPda, poolBump] = findPoolPDA({
        tswap: tswapPda,
        owner: publicKey,
        whitelist: whitelist,
        poolType: poolTypeU8(tensorswap.PoolTypeAnchor.Token),
        curveType: curveTypeU8(tensorswap.CurveTypeAnchor.Exponential),
        startingPrice: starting_price,
        delta: new BN(0),
    });


    tx_confirmed = await tx_confirm(txHash)
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (tx_confirmed == true){
      console.log("Tx confirmed: " + txHash)

      let intentos = 2

      while (intentos > 1){
        try{
          const order = await swapSdk.fetchPool(poolPda)
          const order_data = []
          order_data.push(new_config)
          order_data.push(order)
          return order_data
        }
        catch(error){
          console.error( "\x1b[31m" + "Error in fetchpool: ", error + "\x1b[0m")
          await new Promise(resolve => setTimeout(resolve, 2500));

        }
      } 
    }
  }
}

module.exports = {edit_pool}