
const { gql } = require("@apollo/client");
const {conn,keypair} = require("../common_c");
const web3 = require("@solana/web3.js");
const {VersionedTransaction } = web3;
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const anchor = require("@project-serum/anchor");
const Decimal = require('decimal.js');
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

async function edit_bid(bidinfo,new_price){

  var tx_confirmed = false

  while (tx_confirmed == false) {
    
    try {
      const client = connect_apollo()
      const resptxedit = await client.query({
        query: gql`
          query TcompEditBidTx($bidStateAddress: String!, $compute: Int, $price: Decimal, $priorityMicroLamports: Int) {
            tcompEditBidTx(bidStateAddress: $bidStateAddress, compute: $compute, price: $price, priorityMicroLamports: $priorityMicroLamports) {
              bidState
              txs {
                lastValidBlockHeight
                tx
                txV0
                metadata
              }
            }
          }
        `,
        variables: {
          bidStateAddress: bidinfo.address,
          price: String(new_price*1000000000),
          compute: 100000,
          priorityMicroLamports: 50000
        },
      });
      const response = await resptxedit.data.tcompEditBidTx

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
          sig = await conn.sendTransaction(tx,);
          //console.log(tx)
      }

      console.log("\x1b[33m"+ "(Bid edit)" + "\x1b[0m" + " Sent with hash: " + sig)

      // tx confirmation
      tx_confirmed = await tx_confirm(sig)

      if (tx_confirmed == true){
        console.log("Tx confirmed: " + sig)
        bidinfo.price = String(new_price*1000000000)
        return [bidinfo]
      }

    } catch(error) {
      console.log( '\x1b[31m' +   "An error ocurred sending Tx edit: " + error + '\x1b[0m')
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

//edit_bid("5gMw3mTqko1LHr4eRFcKaYn2H3qakxge2GyDR1Hw7kTr",0.04)

module.exports = {edit_bid}