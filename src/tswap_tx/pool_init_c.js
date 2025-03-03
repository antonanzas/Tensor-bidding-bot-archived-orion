const anchor = require("@project-serum/anchor");
const web3 = require("@solana/web3.js");
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const { conn, keypair} = require("../common_c");
const { BN } = require("@coral-xyz/anchor");
const { tx_confirm} = require("../tx_confirm");
const { findPoolPDA, findTSwapPDA, poolTypeU8, curveTypeU8 } = require("@tensor-oss/tensorswap-sdk") 
const { LAMPORTS_PER_SOL, Transaction,ComputeBudgetProgram } = web3;

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });

async function create_pool(price, publicKey, whitelist,amount){

  var tx_confirmed = false

  while (tx_confirmed == false) {
    const price_with_lamports = new BN(price * LAMPORTS_PER_SOL)
    const delta_final = new BN(0)

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({ 
      units: 150000 
    });
    
    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({ 
      microLamports: 50000
    });

    const config = {
        poolType: tensorswap.PoolTypeAnchor.Token,
        curveType: tensorswap.CurveTypeAnchor.Exponential,
        startingPrice:  price_with_lamports ,
        delta:  delta_final,
        mmCompoundFees: true,
        mmFeeBps: null,
    }

    const initPool = await swapSdk.initPool({
      owner: publicKey,
      whitelist: whitelist,
      config: config,
      maxTakerSellCount: amount,
      customAuthSeed: undefined,
      isCosigned: false,
      orderType: tensorswap.OrderType.Standard,
    });

    const attachPoolMargin = await swapSdk.attachPoolMargin({
      config: config,
      marginNr: 0,
      owner: publicKey,
      whitelist: whitelist
    })

    const transaction = new Transaction().add(modifyComputeUnits).add(addPriorityFee).add(...initPool.tx.ixs).add(...attachPoolMargin.tx.ixs);
    //console.log(transaction);

    let txHash = null
    let try1 = 1
    let contador_back = 5

    while (try1 > 0){
      contador_back = contador_back - 1
      if (contador_back > 0 ) {
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
          console.log("\x1b[32m"+ "(Pool init)" + "\x1b[0m" + " Sent with hash: " + txHash);
          try1 = try1 - 1

          } catch(error){
          console.log( "\x1b[31m"+ "Error ocurred in tx simulation: ", error  + "\x1b[0m")
          await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        else {
          try1 = try1 -1 
        }
    }

    const [tswapPda, tswapBump] = findTSwapPDA({});
    const [poolPda, poolBump] = findPoolPDA({
        tswap: tswapPda,
        owner: publicKey,
        whitelist: whitelist,
        poolType: poolTypeU8(tensorswap.PoolTypeAnchor.Token),
        curveType: curveTypeU8(tensorswap.CurveTypeAnchor.Exponential),
        startingPrice: price_with_lamports,
        delta: delta_final,
    });

    tx_confirmed = await tx_confirm(txHash)
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (tx_confirmed == true){
      let intentos = 2

      while (intentos > 1){
        try{
          console.log("Tx confirmed: " + txHash)
          const order = await swapSdk.fetchPool(poolPda)
          const order_data = []
          order_data.push(config)
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
};

module.exports = {create_pool}