
const { gql } = require("@apollo/client");
const {conn,keypair} = require("../common_c");
const web3 = require("@solana/web3.js");
const {VersionedTransaction } = web3;
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const anchor = require("@project-serum/anchor");
const { tx_confirm} = require("../tx_confirm");

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });

function connect_apollo(){
    const {
      HttpLink,
      ApolloClient,
      InMemoryCache,
      gql,
    } = require("@apollo/client");
    const { ApolloLink, concat } = require("apollo-link");
    const fetch = require("cross-fetch");
    
    const API_KEY = ""
    if (!API_KEY) throw new Error("please specify envvar TENSOR_API_KEY");
    
    // Setup Apollo client.
    const authLink = new ApolloLink((operation, forward) => {
      operation.setContext({
        headers: {
          "X-TENSOR-API-KEY": API_KEY,
        },
      });
      return forward(operation);
    });
    const httpLink = new HttpLink({ uri: "https://api.tensor.so/graphql", fetch });
    const client = new ApolloClient({
      link: concat(authLink, httpLink),
      cache: new InMemoryCache(),
      defaultOptions: {
        query: {
          fetchPolicy: "no-cache",
        },
            watchQuery: {
                fetchPolicy: 'no-cache',
            nextFetchPolicy: 'no-cache',
            }
      },
    });
    return client
}

async function bid_close(bidstate){

  var tx_confirmed = false
  var contador_tx = 0

  while (tx_confirmed == false) {
    contador_tx += 1
    try {
      const client = connect_apollo()
      const resptxclose = await client.query({
        query: gql`
          query TcompCancelCollBidTx($bidStateAddress: String!, $compute: Int, $priorityMicroLamports: Int) {
            tcompCancelCollBidTx(bidStateAddress: $bidStateAddress, compute: $compute, priorityMicroLamports: $priorityMicroLamports) {
              txs {
                tx
                txV0
                lastValidBlockHeight
              }
            }
          }
        `,
        variables: {
          bidStateAddress: bidstate,
          compute: 20000,
          priorityMicroLamports: 50000
        },
      });
      const response = await resptxclose.data.tcompCancelCollBidTx

      const txsToSign = response.txs.map((tx) =>
            tx.txV0
                ? VersionedTransaction.deserialize(response.txs[0].txV0.data)
                : Transaction.from(tx.tx.data)
      );

      // Sign Transactions
      txsToSign.map((tx) =>
          tx instanceof VersionedTransaction
              ? tx.sign([keypair])
              : tx.sign(keypair)
      );

      // Send Transactions to Network
      var sig = null
      for (const tx of txsToSign) {
          sig = await conn.sendTransaction(tx);
      }
      console.log("\x1b[36m"+ "(Bid close)" + "\x1b[0m" + " Sent with hash: " + sig)

      // tx confirmation
      tx_confirmed = await tx_confirm(sig)

      if (tx_confirmed == true){
        console.log("Tx confirmed: " + sig)
      }
      
    } catch(error){
      console.log( '\x1b[31m' +  "An error ocurred in Tx init: " + error + '\x1b[0m')
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

//bid_close("5gMw3mTqko1LHr4eRFcKaYn2H3qakxge2GyDR1Hw7kTr")

module.exports = {bid_close}