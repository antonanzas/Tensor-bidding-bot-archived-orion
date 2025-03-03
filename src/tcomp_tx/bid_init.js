const { gql } = require("@apollo/client");
const {conn,keypair} = require("../common_c");
const { tx_confirm} = require("../tx_confirm");
const web3 = require("@solana/web3.js");
const {VersionedTransaction} = web3;

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


async function create_bid(price,slug,amount,attributes){

  var tx_confirmed = false
  var att = []
  for (x of attributes){
    if (x == null || x == undefined){
      var att = null
    }
    else{
      var objectatt = {trait_type: x.getType(), value: x.getValue()}
      att.push(objectatt)
    }
  }

  var tx_confirmed = false

  while (tx_confirmed == false) {
    
    
    try {
      const client = connect_apollo()
      const resptxinit = await client.query({
        query: gql`
          query tcompBidTx($owner: String!, $price: Decimal!, $quantity: Float!, $attributes: [AttributeInput!], $priorityMicroLamports: Int, $compute: Int, $marginNr: Float, $slug: String) { tcompBidTx(owner: $owner, price: $price, quantity: $quantity, attributes: $attributes, priorityMicroLamports: $priorityMicroLamports, compute: $compute, marginNr: $marginNr, slug: $slug)
            {
              bidState
              txs {
              tx
              txV0
              lastValidBlockHeight
              metadata
              }
            }
          }
        `,
        variables: {
          attributes: att,
          compute: 100000,
          marginNr: 0,
          owner: keypair.publicKey,
          price: String(price*1000000000),
          priorityMicroLamports: 50000,
          quantity: amount,
          slug: slug
        },
      });
      const response = await resptxinit.data.tcompBidTx

      const txsToSign = response.txs.map((tx) =>
            tx.txV0
                ? VersionedTransaction.deserialize(response.txs[0].txV0.data)
                : Transaction.from(tx.tx.data)
      );

      //Sign Transactions
      txsToSign.map((tx) =>
          tx instanceof VersionedTransaction
              ? tx.sign([keypair])
              : tx.sign(keypair)
      );

      //Send Transactions to Network
      var sig = null
      for (const tx of txsToSign) {
          sig = await conn.sendTransaction(tx);
      }
      console.log("\x1b[32m"+ "(Bid init)" + "\x1b[0m" + " Sent with hash: " + sig)

      // tx confirmation
      tx_confirmed = await tx_confirm(sig)

      if (tx_confirmed == true){
        console.log("Tx confirmed: " + sig)
        return [{address: response.bidState, ownerAddress: keypair.publicKey, price: String(price*1000000000), attributes:att}]
      }

    } catch(error){
       console.log( '\x1b[31m' +  "An error ocurred in Tx init: " + error + '\x1b[0m')
       await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

module.exports = {create_bid}