const fs = require('fs');
const sqlite3 = require("sqlite3").verbose()
const {db} = require("./sqlite3")
let sql
const csv = require('csv-parser');
const { gql } = require("@apollo/client");
const { createClient } = require("graphql-ws");
const WebSocket = require('ws');
const {conn,keypair} = require("./common_c");
const {create_pool} = require("./tswap_tx/pool_init_c");
const {edit_pool} = require("./tswap_tx/pool_edit_c");
const {pool_close} = require("./tswap_tx/pool_close_c");
const {create_bid} = require("./tcomp_tx/bid_init");
const {edit_bid} = require("./tcomp_tx/bid_edit");
const {bid_close} = require("./tcomp_tx/bid_close");
const { TensorWhitelistSDK, findWhitelistPDA} = require("@tensor-oss/tensorswap-sdk");
const { BN } = require("@coral-xyz/anchor");
const {out_of_range_message} = require("./discord_webhook");
const web3 = require("@solana/web3.js");
const {PublicKey} = web3;
const { findPoolPDA, findTSwapPDA, poolTypeU8, curveTypeU8 } = require("@tensor-oss/tensorswap-sdk")
const tensorswap = require("@tensor-hq/tensorswap-sdk");
const anchor = require("@project-serum/anchor");
const Collection = require( './classes/Collection');

const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(keypair), {
  commitment: "confirmed",
});

const swapSdk = new tensorswap.TensorSwapSDK({ provider });

const API_KEY = ""
const WSS_URL = "wss://api.tensor.so/graphql"

function capitalizarPrimeraLetra(cadena) {
  return cadena.replace(/\b\w/g, letra => letra.toUpperCase());
}

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

async function leer_csv() {
  return new Promise((resolve) => {
    const arrayFinal = [];
    fs.createReadStream('./data/bidding_info_c.csv')
      .pipe(csv())
      .on('data', (fila) => {
        const arrayFila = Object.entries(fila).map(([columna, valor]) => {
          return convertirSegunColumna(columna, valor);
        });

        const collection = new Collection(arrayFila)

        arrayFinal.push(collection);
      })
      .on('end', () => {
        //console.log('Array Final:', arrayFinal)
        
        resolve(arrayFinal)
      });
  });
}

function convertirSegunColumna(columna, valor) {
  switch (columna) {
    case 'collection':
      nombre = valor
      return valor.toString(); 
    case 'amount':
      return  parseInt(valor); 
    case 'start_price':
      return parseFloat(valor);
    case 'max_price':
      return  parseFloat(valor);
    case 'mint_info':
      mint_var = valor
      return valor.toString();
    case 'slug':
      if (valor == '0'){
        slug = fetchslug(nombre, String(mint_var));
        return slug.toString();
      }
      else{
        return  valor.toString();
      }
    case 'traits':
      if (valor == '0') {
        return valor.toString()
      }
      else {
      const array_traits = valor.split(';')
      var array_traits_final = []
      for (v of array_traits){
        array_traits_final.push(v.split(':'))
      }
      return array_traits_final
      }
    case 'compressed':
      if (valor == '1') {
        return true
      }
      else {
        return false
      }
    case 'id':
      return valor.toString()
    case 'tolerance':
      return parseFloat(valor)
  }
}

async function actualizarCSV() {
  const data = await leer_csv();
  for (let row of data) {
    const slugIndex = row.findIndex((col) => col[0] === 'slug');
    if (row[slugIndex][1] === '0') {
      const collectionName = row.find((col) => col[0] === 'collection')[1];
      const mintInfo = row.find((col) => col[0] === 'mint_info')[1];
      const newValues = await fetchslug(collectionName, mintInfo);
      row[slugIndex][1] = newValues.slug;

      const idIndex = row.findIndex((col) => col[0] === 'id');
      row[idIndex][1] = newValues.id;
    }
  }

  const csvContent = unparse(data.map(row => Object.fromEntries(row)));
  fs.writeFileSync('./data/updated_bidding_info_c.csv', csvContent);
  console.log('CSV actualizado y guardado');
}

async function priorityfee(){
  let intentos1 = 5;
  let exito1 = false;
  while (intentos1 > 0 && !exito1) {
    try {
      const client = connect_apollo()
      const respfee = await client.query({
        query: gql`
          query PriorityFees {
            priorityFees {
              ...ReducedPriorityFees
              __typename
            }
          }
          fragment ReducedPriorityFees on PriorityFees {
            medium
            high
            veryHigh
            __typename
          }
        `
      });
      const  resultfee = await respfee.data;
      exito1 = true
      console.log(resultfee)
    } catch(error){
      console.log( '\x1b[31m' +   "An error ocurred fetching prio fee: " + error + '\x1b[0m')
      intentos1 --
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } 
}

async function fetchslug(name, mint_info) {
  let intentos1 = 5;
  let exito1 = false;
  while (intentos1 > 0 && !exito1) {
    try {
      const client = connect_apollo()
      const respslug = await client.query({
        query: gql`
          query Mint($mint: String!) {
            mint(mint: $mint) {
              collId
              slug
              
            }
          }
        `,
        variables: {
          mint: mint_info
        },
      });
      const  resultslug = await respslug.data.mint;
      console.log("Fetched " + name + " slug: " + String(resultslug.slug))
      console.log("Fetched " + name + " id: " + String(resultslug.collId))
      exito1 = true
      
      return String(resultslug.slug)
    } catch(error){
      console.log( '\x1b[31m' +   "An error ocurred fetching new slugs: " + error + '\x1b[0m')
      intentos1 --
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function tcompbids(slug) {
  let intentos2 = 5;
  let exito2 = false;
  while (intentos2 > 0 && !exito2) {
    try {
      const client = connect_apollo()
      const resp = await client.query({
        query: gql`
          query Tcompbids($slug: String!) {
            tcompBids(slug: $slug) {
              solBalance
              address
              quantity
              target
              amount
              ownerAddress
              attributes {
                trait_type
                value
              }
            }
          }
        `,
        variables: {
          slug: String(slug)
        },
      });
      const results = await resp.data.tcompBids;
      exito2 = true
      return results;
    } catch(error){
      console.log( '\x1b[31m' + "An error ocurred fetching bids: " + error + '\x1b[0m')
      intentos2 --
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function tcompFpCheck (slug,bidsToCheck,fila){

  try {
    const rowCollectionCheck = await new Promise((resolve, reject) => {
      db.all(`SELECT * FROM collections WHERE collID = ?`, [slug], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    for (btc of bidsToCheck){
      var bidBelow = btc[1]
      if (rowCollectionCheck[0].bid > btc[0].price/1000000000 && rowCollectionCheck[0].bid < fila.getMaxPriceSol() ){

        var price = parseFloat(rowCollectionCheck[0].bid) + parseFloat(0.0005)
        console.log("(fp > trait bid); Price in range "+ "\x1b[33m" + price.toFixed(9) + "\x1b[0m" + " outbidding")

        //edit bid
        var bid_data_update = await edit_bid(btc[0],price.toFixed(9))
              
        bid_data_update.push(bidBelow)
        bidsToCheck = [bid_data_update]  
      }
    }

  } catch(error){
    console.log('\x1b[31m' + "Error en bid check tcomp: " + error.message + '\x1b[0m')
  }
}


async function websock_tcombids(my_bid,fila) {
  const slug = fila.getSlug()
  try {
    var cont_out_range = 0
    const clientOptions = {
      url: WSS_URL,
      webSocketImpl: WebSocket,
      connectionParams: {
        "X-TENSOR-API-KEY": "8919d156-833f-46f3-afc9-380d9c3d7aa3"
      }
    };
    const client = createClient(clientOptions);
    const subscription = client.iterate({
      query: `subscription TcompBidUpdate($slug: String!) {
                tcompBidUpdate(slug: $slug) {
                  address
                  bid {
                    address
                    amount
                    attributes {
                      trait_type
                      value
                    }
                    ownerAddress
                    quantity
                    solBalance
                  }
                }
              }`,
      variables: {
        slug: slug
      },
      operationName: 'TcompBidUpdate'
    });
    console.log("Bid changes on " + slug +" connected");
    var max_price = fila.getMaxPriceSol()

    // Leer db y ajustar bid si está por debajo de fp cada 2 min

    setInterval( function(){tcompFpCheck(slug,my_bid,fila)},60000)

    // on each event 

    for await (const event of subscription) {

      var coincidence = 0 

      if (event.data.tcompBidUpdate.bid != null){
        for (const bid of my_bid) {
          if (event.data.tcompBidUpdate.bid.attributes != null && fila.getTraits().length != 0){
            for (var i = 0; i < event.data.tcompBidUpdate.bid.attributes.length; i++){
              for (var u = 0; u < fila.getTraits().length; u++) {
                if (event.data.tcompBidUpdate.bid.attributes[i].trait_type.toLowerCase() == bid[0].attributes[u].trait_type.toLowerCase() && event.data.tcompBidUpdate.bid.attributes[i].value.toLowerCase() == bid[0].attributes[u].value.toLowerCase()){
                  coincidence ++
                }
              }
            }
          } else if ( event.data.tcompBidUpdate.bid.attributes == null && fila.getTraits().length == 0){
            coincidence ++
          }
          
          if (coincidence > 0 && bid[0].ownerAddress != event.data.tcompBidUpdate.bid.ownerAddress && bid[0].price/1000000000 <= event.data.tcompBidUpdate.bid.amount/1000000000){
            
            bid_price = parseFloat(event.data.tcompBidUpdate.bid.amount/1000000000) + parseFloat(1/1000000000)
      
            if ( bid_price < max_price) {
              
              var price = parseFloat(event.data.tcompBidUpdate.bid.amount/1000000000) + parseFloat(1/1000000000)
              console.log("U got outbided; Price in range "+ "\x1b[33m" + price.toFixed(9) + "\x1b[0m" + " outbidding")


              //edit bid
              var bid_data_update = await edit_bid(bid[0],price.toFixed(9))
              
              var bid_abajo = event.data.tcompBidUpdate.bid.address
              bid_data_update.push(bid_abajo)
              my_bid = [bid_data_update]
            }
            else{
              if (cont_out_range == 0) {
                out_of_range_message(slug,max_price,bid_price)
                cont_out_range = cont_out_range + 1
              }
            }
          }
        }
      }
    }
  } catch(error){
    console.log( '\x1b[31m' + " Error in websock bids (tcomps)" + error +  '\x1b[0m')
  }
}

async function primera_bid_tcomp(my_data, bids, dicc_bids) {
  let active_bid = null
  const slug = my_data.getSlug()

  if (slug in dicc_bids){
    for (x of dicc_bids[slug]){
      if (x.bid.attributes != null){
        for (var i = 0; i < x.bid.attributes.length; i++) {
          for (var u = 0; u < my_data.getTraits().length; u++) {
            if (x.bid.attributes[i].trait_type.toLowerCase() == my_data.getTraits()[u].getType().toLowerCase() && x.bid.attributes[i].value.toLowerCase() == my_data.getTraits()[u].getValue().toLowerCase()){
              active_bid = {address: x.bid.address, ownerAddress: x.bid.ownerAddress, price: x.bid.amount, attributes: x.bid.attributes}
            }
          }  
        }
      } else if (my_data.getTraits().length == 0) {
        active_bid = {address: x.bid.address, ownerAddress: x.bid.ownerAddress, price: x.bid.amount, attributes: x.bid.attributes}
      }
    }
  }


  if (bids.length != 0){
    var precio_mas_alto = 0
    var bid_mas_alta = null
    var bid_alta_2 = null
    for (const x of bids){
      if(x.attributes!= null && my_data.getTraits().length != 0){
        for (var i = 0; i < x.attributes.length; i++) {
          for (var u = 0; u < my_data.getTraits().length; u++) {
            if (x.amount/1000000000 > precio_mas_alto/1000000000 && x.attributes[i].trait_type.toLowerCase() == my_data.getTraits()[u].getType().toLowerCase() && x.attributes[i].value.toLowerCase() == my_data.getTraits()[u].getValue().toLowerCase()) {
              precio_mas_alto = x.amount
              bid_alta_2 = bid_mas_alta
              bid_mas_alta = x
            }
          }
        }
      } else if (my_data.getTraits().length == 0 &&  x.attributes == null) {
        if (x.amount/1000000000 > precio_mas_alto/1000000000 ) {
          precio_mas_alto = x.amount
          bid_alta_2 = bid_mas_alta
          bid_mas_alta = x
        }
      }
    }

    if (bid_mas_alta != null){

      if (bid_mas_alta.ownerAddress == keypair.publicKey){
        console.log("\x1b[32m"+ "You have the highest bid"  + "\x1b[0m")
        var bid_data = [active_bid]
        bid_data.push(bid_alta_2)
        await new Promise(resolve => setTimeout(resolve, 2000));
        return bid_data
      }
      else if(active_bid != null && bid_mas_alta.amount/1000000000 < my_data.getMaxPriceSol()){
        const new_price = parseFloat(bid_mas_alta.amount/1000000000) +  parseFloat(1/1000000000)

        console.log("Editing active bid: " + "\x1b[33m"+ new_price + "\x1b[0m")
        var bid_data = await edit_bid(active_bid,new_price)
        bid_data.push(bid_mas_alta.address)
        return bid_data
      }
      else if (active_bid != null){
        console.log("It is higher than your max price for this bid")
        var bid_data = [active_bid]
        bid_data.push(bid_alta_2)
        await new Promise(resolve => setTimeout(resolve, 2000));
        return bid_data
      }
      else if (bid_mas_alta.amount/1000000000 < my_data.getMaxPriceSol() && bid_mas_alta.amount/1000000000 > my_data.getMinPriceSol() && bid_mas_alta.ownerAddress != keypair.publicKey){
        price = parseFloat(bid_mas_alta.amount/1000000000) +  parseFloat(1/1000000000)

        console.log("Setting the highest bid: " + "\x1b[32m" + price  + "\x1b[0m")

        //send tx bid
        var bid_data = await create_bid(price, slug, my_data.getAmount(), my_data.getTraits())
        bid_data.push(bid_mas_alta)
        return bid_data
      }
      else if  (bid_mas_alta.ownerAddress != keypair.publicKey){

        price = parseFloat(my_data.getMinPriceSol())
        console.log("Out of range, setting a bid with min price: " + "\x1b[32m" + price  + "\x1b[0m")

        //send tx bid
        var bid_data = await create_bid(price, slug, my_data.getAmount(), my_data.getTraits())
        bid_data.push(bid_mas_alta)
        return bid_data
        
      }
    }
    else {
      const min_price = parseFloat(my_data.getMinPriceSol());
      console.log("No bids with this trait, setting a bid with min price: " + "\x1b[32m" + min_price  + "\x1b[0m" )

      //send tx bid
      var bid_data = await create_bid(min_price, slug, my_data.getAmount(), my_data.getTraits())
      bid_data.push({})
      return bid_data
    }
  }
  else {
    const min_price = parseFloat(my_data.getMinPriceSol());
    console.log("No trait bids in this collection, setting a bid with min price: " + "\x1b[32m" + min_price  + "\x1b[0m")

    //send tx bid
    var bid_data = await create_bid(min_price, slug, my_data.getAmount(), my_data.getTraits())
    bid_data.push({})
    return bid_data
  }

  
}

async function tswaporders(slug) {
  let intentos2 = 5;
  let exito2 = false;
  while (intentos2 > 0 && !exito2) {
    try {
      const client = connect_apollo()
      const resp = await client.query({
        query: gql`
          query Tswaporders($slug: String!) {
            tswapOrders(slug: $slug) {
              address
              sellNowPrice
              currentActive
              solBalance
              ownerAddress
              poolType
            }
          }
        `,
        variables: {
          slug: String(slug)
        },
      });
      const results = await resp.data.tswapOrders;
      
      results.sort((a, b) => b.sellNowPrice - a.sellNowPrice);

      exito2 = true
      return results;
    } catch(error){
      console.log( '\x1b[31m' + "An error ocurred fetching orders: " + error + '\x1b[0m')
      intentos2 --
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

//tswaporders("62915557-51cd-48a4-913d-4ca55e8480d2")

async function websock_tswaporders(my_bid,fila) {

  const slug = fila.getSlug()
  const whitelist = fila.getWhitelist()
  const max_price = fila.getMaxPriceSol()
  const amount_nfts = fila.getAmount()

  try {
    var cont_out_range = 0
    const clientOptions = {
      url: WSS_URL,
      webSocketImpl: WebSocket,
      connectionParams: {
        "X-TENSOR-API-KEY": "8919d156-833f-46f3-afc9-380d9c3d7aa3"
      }
    };
    const client = createClient(clientOptions);
    const subscription = client.iterate({
      query: `subscription TswapOrderUpdate($slug: String!) {
                tswapOrderUpdate(slug: $slug) {
                  address
                  pool {
                    sellNowPrice
                    ownerAddress
                    poolType
                  }
                }
              }`,
      variables: {
        slug: slug
      },
      operationName: 'TswapOrderUpdate'
    });

    //Add info to DB

    var existinginfo = false
    var diff = null
    var fp = null
    var pools = await tswaporders(slug)

    while (existinginfo == false){
      try {
        const rows = await Promise.race([
          new Promise((resolve, reject) => {
              db.all(`SELECT * FROM collections WHERE collID = ?`, [slug], (err, rows) => {
                  if (err) {
                      reject(err);
                  } else {
                      resolve(rows);
                  }
              });
          }),
          new Promise((resolve, reject) => {
              setTimeout(() => {
                  reject(new Error("La consulta ha superado el tiempo de espera"));
              }, 10000); // Tiempo de espera en milisegundos (10 segundos)
          })
        ]);

        if (rows != undefined){
          rows.forEach(row => {
            fp = row.fp
            diff = pools[0].sellNowPrice / 1000000000 / row.fp;
            existinginfo = true;
          });
        }
      } catch(error){
        console.log("No info about this row yet")
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const parsedSlug = slug.replace(/-/g, '');
    var nombretabla =  "BIDS_" + parsedSlug

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      //Completar la tabla collections

      sql =`UPDATE collections SET bid = ?, diff = ? WHERE collID = ?`
      db.run(sql,[pools[0].sellNowPrice/1000000000,diff,slug],(err) => {
          if (err) return console.error(err.message + "updating collections")
      })

      //Borrar la tabla BIDS si existe 

      db.run(`DROP TABLE IF EXISTS ${nombretabla}`, (err) => {
        if (err) return console.error(err.message + " dropping table");
      })

      // Crear la tabla BIDS 

      db.run(`CREATE TABLE ${nombretabla} (id INTEGER PRIMARY KEY, address, price)`, (err) => {
        if (err) return console.error(err.message + " creating table");
      })

      //Insertar info en la tabla BIDS
    
      const stmt = db.prepare(`INSERT INTO ${nombretabla} (address,price) VALUES (?,?)`);
      pools.forEach(p => stmt.run(p.address, p.sellNowPrice/1000000000));
      stmt.finalize();
      
      
      db.run('COMMIT', (err) => {
        if (err) return console.error(err.message + " en tx inicial de tswap")
      })
    })

    console.log("Order changes for " + slug +" connected");

    //On each event
    
    for await (const event of subscription) {
  
      const poolAdd = event.data.tswapOrderUpdate.address
      var poolPrice = null

      if (event.data.tswapOrderUpdate.pool != null && event.data.tswapOrderUpdate.pool.sellNowPrice != null){
        poolPrice = event.data.tswapOrderUpdate.pool.sellNowPrice/1000000000
      }
      
      //Leer db antes de cada evento
      const rowCollection = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM collections WHERE collID = ?`, [slug], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      const orderbookBids = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${nombretabla} ORDER BY price DESC`, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      if (rowCollection != undefined){
          topbid = rowCollection[0].bid
          fp = rowCollection[0].fp
          diff = rowCollection[0].diff;
      } else {
        console.log("ERROR NO ROW IN DB FOR " + slug)
      }

      //Editar mis bids independientemente de la db
      for (const bid of my_bid) {
        var bid_abajo = bid[2]
        if (event.data.tswapOrderUpdate.pool != null){
          const price_my_order = bid[1].config.startingPrice.toString()/1000000000
          const wallet_my_order = bid[1].owner.toString()
          const price_update = event.data.tswapOrderUpdate.pool.sellNowPrice/1000000000

          if (wallet_my_order != event.data.tswapOrderUpdate.pool.ownerAddress && price_my_order <= price_update) {
            bid_price = (parseFloat(event.data.tswapOrderUpdate.pool.sellNowPrice) + parseFloat(1))/1000000000

            if ( bid_price < max_price) { 
              console.log("U got outbided; Price in range " + "\x1b[33m" + bid_price.toFixed(9) + "\x1b[0m" + " outbidding")
              
              var order_data_update = await edit_pool(bid_price,keypair.publicKey,whitelist,bid[0], amount_nfts)
              
              order_data_update.push(bid_abajo)
              my_bid = [order_data_update]
            }
            else{
              if (cont_out_range == 0) {
                out_of_range_message(slug,max_price,bid_price)
                cont_out_range = cont_out_range + 1
              }
            }
          }
        }
      }

      //Editar db

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        if (event.data.tswapOrderUpdate.pool != null){
          if (event.data.tswapOrderUpdate.pool.sellNowPrice != null) {
            let estaPresente = orderbookBids.some(sublista => sublista.address === event.data.tswapOrderUpdate.address);

            if (estaPresente) {
              db.run(`DELETE FROM ${nombretabla} WHERE address = ?`, [poolAdd], (err) =>  {
                if (err) return console.error(err.message + nombretabla)
              });
            }

            db.run(`INSERT INTO ${nombretabla} (address, price) VALUES (?, ?)`, [poolAdd, poolPrice], (err) => {
              if (err) return console.error(err.message + nombretabla)
            });
            
          } else {
            db.run(`DELETE FROM ${nombretabla} WHERE address = ?`, [poolAdd], (err) =>  {
              if (err) return console.error(err.message + nombretabla)
            });
          }
        } else {
          db.run(`DELETE FROM ${nombretabla} WHERE address = ?`, [poolAdd], (err) =>  {
            if (err) return console.error(err.message  + nombretabla) 
          });
        }

        //console.log(event.data)

        db.all(`SELECT * FROM ${nombretabla} ORDER BY price DESC LIMIT 1`, [], (err, rows) => {
          if (err) return console.error(err.message  + nombretabla)

          var newDiff = rows[0].price / fp

          if (orderbookBids[0].price != rows[0].price ) {

            sql =`UPDATE collections SET bid = ?, diff = ? WHERE collID = ?`
            db.run(sql,[rows[0].price,newDiff,slug],(err) => {
              if (err) return console.error(err.message)
            })
          } 
        });

        db.run('COMMIT', (err) => {
          if (err) return console.error(err.message);
        });
      })
      
      //Edits segun DB si mi bid es la primera y la siguiente está lejos

      if (orderbookBids[0][0] ){}

    }
  } catch(error){
    console.log( '\x1b[31m' + "An error ocurred in websock bids: " + error +  '\x1b[0m')
  }
}

async function aux_websock_tswap(slug){
  try {
    var cont_out_range = 0
    const clientOptions = {
      url: WSS_URL,
      webSocketImpl: WebSocket,
      connectionParams: {
        "X-TENSOR-API-KEY": "8919d156-833f-46f3-afc9-380d9c3d7aa3"
      }
    };
    const client = createClient(clientOptions);
    const subscription = client.iterate({
      query: `subscription TswapOrderUpdate($slug: String!) {
                tswapOrderUpdate(slug: $slug) {
                  address
                  pool {
                    sellNowPrice
                    ownerAddress
                    poolType
                  }
                }
              }`,
      variables: {
        slug: slug
      },
      operationName: 'TswapOrderUpdate'
    });

    //Add info to DB

    var existinginfo = false
    var diff = null
    var fp = null
    var pools = await tswaporders(slug)

    while (existinginfo == false){
      try {
        const rows = await Promise.race([
          new Promise((resolve, reject) => {
              db.all(`SELECT * FROM collections WHERE collID = ?`, [slug], (err, rows) => {
                  if (err) {
                      reject(err);
                  } else {
                      resolve(rows);
                  }
              });
          }),
          new Promise((resolve, reject) => {
              setTimeout(() => {
                  reject(new Error("La consulta ha superado el tiempo de espera"));
              }, 10000); // Tiempo de espera en milisegundos (10 segundos)
          })
        ]);

        if (rows != undefined){
          rows.forEach(row => {
            fp = row.fp
            diff = pools[0].sellNowPrice / 1000000000 / row.fp;
            existinginfo = true;
          });
        }
      } catch(error){
        console.log("No info about this row yet" )
        console.log(error)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    const parsedSlug = slug.replace(/-/g, '');
    var nombretabla =  "BIDS_" + parsedSlug

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      //Completar la tabla collections

      sql =`UPDATE collections SET bid = ?, diff = ? WHERE collID = ?`
      db.run(sql,[pools[0].sellNowPrice/1000000000,diff,slug],(err) => {
          if (err) return console.error(err.message + "updating collections")
      })

      //Borrar la tabla BIDS si existe 

      db.run(`DROP TABLE IF EXISTS ${nombretabla}`, (err) => {
        if (err) return console.error(err.message + " dropping table");
      })

      // Crear la tabla BIDS 

      db.run(`CREATE TABLE ${nombretabla} (id INTEGER PRIMARY KEY, address, price)`, (err) => {
        if (err) return console.error(err.message + " creating table");
      })

      //Insertar info en la tabla BIDS
    
      const stmt = db.prepare(`INSERT INTO ${nombretabla} (address,price) VALUES (?,?)`);
      pools.forEach(p => stmt.run(p.address, p.sellNowPrice/1000000000));
      stmt.finalize();
      
      
      db.run('COMMIT', (err) => {
        if (err) return console.error(err.message + " en tx inicial de tswap")
      })
    })

    console.log("AUX Order changes for " + slug +" connected");
    
    //On each event
    
    for await (const event of subscription) {
  
      const poolAdd = event.data.tswapOrderUpdate.address
      var poolPrice = null

      if (event.data.tswapOrderUpdate.pool != null && event.data.tswapOrderUpdate.pool.sellNowPrice != null){
        poolPrice = event.data.tswapOrderUpdate.pool.sellNowPrice/1000000000
      }
      
      //Leer db antes de cada evento
      const rowCollection = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM collections WHERE collID = ?`, [slug], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      const orderbookBids = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${nombretabla} ORDER BY price DESC`, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      if (rowCollection != undefined){
          topbid = rowCollection[0].bid
          fp = rowCollection[0].fp
          diff = rowCollection[0].diff;
      } else {
        console.log("ERROR NO ROW IN DB FOR " + slug)
      }

      //Editar db

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        if (event.data.tswapOrderUpdate.pool != null){
          if (event.data.tswapOrderUpdate.pool.sellNowPrice != null) {
            let estaPresente = orderbookBids.some(sublista => sublista.address === event.data.tswapOrderUpdate.address);

            if (estaPresente) {
              db.run(`DELETE FROM ${nombretabla} WHERE address = ?`, [poolAdd], (err) =>  {
                if (err) return console.error(err.message + nombretabla)
              });
            }

            db.run(`INSERT INTO ${nombretabla} (address, price) VALUES (?, ?)`, [poolAdd, poolPrice], (err) => {
              if (err) return console.error(err.message + nombretabla)
            });
            
          } else {
            db.run(`DELETE FROM ${nombretabla} WHERE address = ?`, [poolAdd], (err) =>  {
              if (err) return console.error(err.message + nombretabla)
            });
          }
        } else {
          db.run(`DELETE FROM ${nombretabla} WHERE address = ?`, [poolAdd], (err) =>  {
            if (err) return console.error(err.message  + nombretabla) 
          });
        }

        //console.log(event.data)

        db.all(`SELECT * FROM ${nombretabla} ORDER BY price DESC LIMIT 1`, [], (err, rows) => {
          if (err) return console.error(err.message  + nombretabla)

          var newDiff = rows[0].price / fp

          if (orderbookBids[0].price != rows[0].price ) {

            sql =`UPDATE collections SET bid = ?, diff = ? WHERE collID = ?`
            db.run(sql,[rows[0].price,newDiff,slug],(err) => {
              if (err) return console.error(err.message)
            })
          } 
        });

        db.run('COMMIT', (err) => {
          if (err) return console.error(err.message);
        });
      })
      
      //Edits segun DB si mi bid es la primera y la siguiente está lejos

      if (orderbookBids[0][0] ){}

    }
  } catch(error){
    console.log( '\x1b[31m' + "Error AUX websock bids: " + error.message +  '\x1b[0m')
  }
}

// aux_websock_tswap("yeah_tigers")
// aux_websock_tswap("62915557-51cd-48a4-913d-4ca55e8480d2")
// aux_websock_tswap("91db4b7f-6107-47b4-8b04-8cfad4deb7d5")

async function primera_bid_tswap(my_data, orders,dicc_datos) {
  let active_bid = null

  const amount = my_data.getAmount()
  const whitelist = my_data.getWhitelist()

  if (whitelist in dicc_datos){
    active_bid = dicc_datos[whitelist]
  }
  
  if (orders.length != 0){

    bid_mas_alta = orders[0]
    bid_alta_2 = orders[1]

    if (bid_mas_alta.ownerAddress == keypair.publicKey){
      console.log("\x1b[32m"+ "You have the highest bid"  + "\x1b[0m")
      var order_data = dicc_datos[whitelist]
      order_data.push(bid_alta_2)
      await new Promise(resolve => setTimeout(resolve, 2000));
      return order_data
    }
    else if(active_bid != null && bid_mas_alta.sellNowPrice/1000000000 < my_data.getMaxPriceSol()){
      const new_price = (parseInt(bid_mas_alta.sellNowPrice) + parseInt(1))/1000000000
      console.log("Editing your active bid: " + "\x1b[33m"+ new_price + "\x1b[0m")
      var order_data = await edit_pool(new_price,keypair.publicKey,whitelist,active_bid[0],my_data.getAmount())
      order_data.push(bid_mas_alta)
      return order_data
    }
    else if (active_bid != null){
      console.log("It is higher than your max price for this bid")
      var order_data = dicc_datos[whitelist]
      order_data.push(bid_alta_2)
      await new Promise(resolve => setTimeout(resolve, 2000));
      return order_data
    }
    else if (bid_mas_alta.sellNowPrice/1000000000 < my_data.getMaxPriceSol() && bid_mas_alta.sellNowPrice/1000000000 > my_data.getMinPriceSol() && bid_mas_alta.ownerAddress !=  keypair.publicKey){
     
      price = parseFloat(bid_mas_alta.sellNowPrice/1000000000) +  parseFloat(0.00000001)

      console.log("Setting highest bid: " + "\x1b[32m" + price + "\x1b[0m" )

      //send tx bid
      var order_data = await create_pool(price,keypair.publicKey, whitelist,amount)
      order_data.push(bid_mas_alta)
      return order_data
    }
    else if ( bid_mas_alta.ownerAddress != keypair.publicKey){
      price = parseFloat(my_data.getMinPriceSol())

      console.log("Out of range, setting a bid with min price: " + "\x1b[32m" + price + "\x1b[0m")

      //send tx bid
      var order_data = await create_pool(price,keypair.publicKey, whitelist,amount)
      order_data.push(bid_mas_alta)
      return order_data
      
    }
    else {
      console.log("It is higher than your max price for this bid")
      return null
    }
  }
  else {
    const min_price = parseFloat(my_data.getMinPriceSol());

    console.log("No bids with this parameters, setting a bid with min price: " + "\x1b[32m" + min_price + "\x1b[0m" )

    //send tx bid
    var order_data = await create_pool(min_price,keypair.publicKey, whitelist,amount)
    order_data.push(bid_mas_alta)
    return order_data
  }
}

async function refetch_bids(slug){
  const orders = await tswaporders(slug)

  var precio_mas_alto = 0
  var bid_mas_alta = {}
  for (const x of orders){
    if (x.sellNowPrice/1000000000 > precio_mas_alto/1000000000 && x.ownerAddress != keypair.publicKey) {
      precio_mas_alto = x.sellNowPrice
      bid_mas_alta = x
    }
  }
  console.log("The highest bid is: " + precio_mas_alto/1000000000 + " sol; From: " + bid_mas_alta.ownerAddress)
  price = (parseFloat(bid_mas_alta.sellNowPrice) + parseFloat(1) )/1000000000
  const refetch_data = []
  refetch_data.push(price)
  refetch_data.push(bid_mas_alta)
  return refetch_data
}

async function iterar_fila(datos) {
  
  await new Promise(resolve => setTimeout(resolve, 1500));
  dicc_datos = await get_data_orders()
  dicc_bids = await get_data_bids()
  dicc_WSS = {}
  for (const fila of datos) {
    dicc_WSS[fila.getSlug()] = false
    if (fila.getTraits().length == 0){

      if (!fila.getCompressed()){
        dicc_WSS[fila.getSlug()] = true
        const id = fila.getId()
        const uuid = TensorWhitelistSDK.uuidToBuffer(id);
        const whitelist = findWhitelistPDA({uuid: uuid})[0];
        fila.setWhitelist(whitelist)

        console.log("Checking " + fila.getNombre() + " orders... (Collection bids)")
        const orders = await tswaporders(fila.getSlug())
        const my_order = await primera_bid_tswap(fila, orders,dicc_datos)

        if (my_order != null){
          my_order.push(fila.getId())
          var contenido = [my_order]
          
          try{
            websock_tswaporders(contenido,fila)
          } catch (error){
            console.log("An error ocurred in swap websock: " + error)
          }
        }
      } else {
        console.log("Checking " + fila.getNombre() + " bids... (Compressed collection bids)")

        const bids = await tcompbids(fila.getSlug())
        const my_bid = await primera_bid_tcomp(fila, bids, dicc_bids)

        if (my_bid != null){
          try{
            websock_tcombids([my_bid], fila)
          } catch (error){
            console.log("An error ocurred in tcomp websocks: " + error)
          }
        }
      }
    }
    else{
      console.log("Checking " + fila.getNombre() + " bids... (Bid by traits)")

      const bids = await tcompbids(fila.getSlug())
      const my_bid = await primera_bid_tcomp(fila, bids, dicc_bids)

      if (my_bid != null){
        try{
          websock_tcombids([my_bid], fila)
        } catch (error){
          console.log("An error ocurred in tcomp websocks: " + error)
        }
      }
    }
  }
  for (let clave in dicc_WSS) {
    if (dicc_WSS[clave] == false){
      await new Promise(resolve => setTimeout(resolve, 1500));
      aux_websock_tswap(clave)
    }
}
}

async function new_opportunities(max_sol,amount,time, min_sol_m, minimum_percent_m){
  if (time == 1){
    sort = "statsV2.volume1h:desc"
    volume = "1h"
  }
  else if(time == 24) {
    sort = "statsV2.volume24h:desc"
    volume = "24h"
  }
  else {
    sort = "statsV2.volume7d:desc"
    volume = "7d"
  }


  const client = connect_apollo()
  for (let i = 1; i <= amount; i++) {
    let intentos3 = 5;
    let exito3 = false;
    var results = null
    while (intentos3 > 0 && !exito3) {
      try {
        const resp = await client.query({
          query: gql`
            query CollectionStats($slugs: [String!],
                $slugsMe: [String!],
                $slugsDisplay: [String!],
                $ids: [String!],
                $sortBy: String,
                $page: Int,
                $limit: Int,) {
              allCollections( slugs: $slugs,
                  slugsMe: $slugsMe,
                  slugsDisplay: $slugsDisplay,  
                  ids: $ids,
                  sortBy: $sortBy,
                  page: $page,
                  limit: $limit) {
                total
                collections {
                  slug
                  statsV2 {
                    buyNowPrice
                    sellNowPrice
                  }
                  name
                }   
              }
            }
          `,
          variables: {
            "slugs": null,
            "slugsMe": null,
            "slugsDisplay": null,
            "ids": null,
            "sortBy": sort, 
            "limit": 50, 
            "page": i
          },
        });
        results = await resp.data.allCollections.collections;
        exito3 = true
      } catch(error){
        console.log( '\x1b[31m' + "An error ocurred fetching new opportunities " + error + '\x1b[0m')
        intentos3 --
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    //console.log(results)
    const lista_coll = []

    for (const c of results) {
      
      const bid_price = c.statsV2.sellNowPrice/1000000000
      const sell_price = c.statsV2.buyNowPrice/1000000000

      const margin = sell_price-bid_price
      const percent_margin = margin / sell_price * 100

      if (margin > 0 && bid_price < max_sol && margin > min_sol_m && percent_margin > minimum_percent_m){
        lista_coll.push([c.name, sell_price, margin, percent_margin])
      }
    }
    console.log("---------------------- "+"Top "+ (i-1)*50 + "-" + i*50 + " by " + volume + " volume " +"----------------------")
    for (x of lista_coll){
      console.log(x[0] + " ->" + " FP: " + '\x1b[34m' + x[1] + ";" + '\x1b[0m' + " Sol margin: " + '\x1b[32m' + x[2].toFixed(2) + " sol;" +  '\x1b[0m' + " % margin: " + '\x1b[32m'+ x[3].toFixed(2)+ " %" +  '\x1b[0m'  )
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (i == amount){
      console.log("Task finished")
    }
    else {
      console.log("Fetching next batch...")
    }
  }
}

async function new_traits_opportunities(slug,minimumPrice){
  const client = connect_apollo()
  var batchs = 0
    var timestamp_query_while = Date.now()
    while (timestamp < timestamp_query_while && timestamp_query_while != null){
      var results = null
      if (batchs == 0){
        let intentos = 3;
        let exito = false;
        while (intentos > 0 && !exito) {
          try{
            const resp = await client.query({
              query: gql`
                query recentTransactions($slug: String!, $limit: Int, $cursor: TransactionsCursorInput, $filters: TransactionsFilters) {
                  recentTransactions(slug: $slug, limit: $limit, cursor: $cursor, filters: $filters) {
                    txs {
                      mint {
                        onchainId
                        attributes {
                          trait_type
                          value
                        }
                      }
                      tx {
                        txType
                        grossAmount
                      }
                    }
                    page {
                      endCursor {
                        txAt
                        txKey
                      }
                      hasMore
                    }
                  }
                }
              `,
              variables: {
                "slug": slug,
                "filters": {"txTypes": ['SALE_BUY_NOW','SWAP_SELL_NFT','SWAP_BUY_NFT','SWAP_BUY_SINGLE_LISTING'], prices: {min: minimumPrice}},
                "limit": 100
              }
            });
          results = await resp.data.recentTransactions;
          exito = true
          } catch(error){
            intentos --
            console.log( '\x1b[31m' + "An error ocurred doing recent transactions query" + error+ '\x1b[0m')
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        timestamp_query = results.page.endCursor
        if (timestamp_query != null){
          timestamp_query_while = timestamp_query.txAt
          all_results.push(results.txs)
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        else{
          timestamp_query_while = null
        }
        console.log("Fetched tx batch number " + batchs)
        batchs +=1
        
      }
      else {
        let intentos = 3;
        let exito = false;
        while (intentos > 0 && !exito) {
          try {
            const resp = await client.query({
              query: gql`
                query recentTransactions($slug: String!, $limit: Int, $cursor: TransactionsCursorInput, $filters: TransactionsFilters) {
                  recentTransactions(slug: $slug, limit: $limit, cursor: $cursor, filters: $filters) {
                    txs {
                      mint {
                        onchainId
                        attributes {
                          trait_type
                          value
                        }
                      }
                      tx {
                        txType
                        grossAmount
                      }
                    }
                    page {
                      endCursor {
                        txAt
                        txKey
                      }
                      hasMore
                    }
                  }
                }
              `,
              variables: {
                "slug": slug,
                "filters": {"txTypes": ['SALE_BUY_NOW','SWAP_SELL_NFT','SWAP_BUY_NFT','SWAP_BUY_SINGLE_LISTING'], prices: {min: minimumPrice}},
                "limit": 100,
                "cursor":{"txAt": timestamp_query.txAt, "txKey": timestamp_query.txKey}
              }
            });
            results = await resp.data.recentTransactions;
            exito = true
          } catch(error){
            intentos --
            console.log(  '\x1b[31m' + "An error ocurred doing recent transactions query" + error + '\x1b[0m' )
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        timestamp_query = results.page.endCursor
        if (timestamp_query != null){
          timestamp_query_while = timestamp_query.txAt
          all_results.push(results.txs)
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        else{
          timestamp_query_while = null
        }
        console.log("Fetched tx batch number " + batchs)
        batchs +=1
      }
    }
}

async function user_orders(){
  let intentos4 = 3;
  let exito4 = false;
  while (intentos4 > 0 && !exito4) {
    try {
      const client = connect_apollo()
      const respSwaps = await client.query({
        query: gql`
          query userTswapOrders($owner: String!) {
            userTswapOrders(owner: $owner) {
              pool {
                address
                balance
                curveType
                delta
                isCosigned
                maxTakerSellCount
                orderType
                ownerAddress
                poolType
                startingPrice
                whitelistAddress
              }
            }
          }
        `,
        variables: {
          owner: keypair.publicKey
        },
      });
      const  resultswaps = await respSwaps.data;
      exito4 = true
      return resultswaps.userTswapOrders
    } catch(error){
      console.log( '\x1b[31m' + "An error ocurred fething user orders:" + error + '\x1b[0m')
      intentos4 --
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function user_bids(){
  let intentos4 = 3;
  let exito4 = false;
  while (intentos4 > 0 && !exito4) {
    try {
      const client = connect_apollo()
      const respcomp = await client.query({
        query: gql`
          query userTcompBids($owner: String!) {
            userTcompBids(owner: $owner) {
              bid {
                address
                amount
                attributes {
                  trait_type
                  value
                }
                ownerAddress
                quantity
              }
              collInfo {
                  slug
                }
            }
          }
        `,
        variables: {
          owner: keypair.publicKey
        },
      });
      const  resultcomp = await respcomp.data;
      exito4 = true
      return resultcomp.userTcompBids
    } catch(error){
      console.log( '\x1b[31m' + "An error ocurred fething user bids:" + error + '\x1b[0m')
      intentos4 --
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function get_data_bids(){
  my_bids_user= await user_bids()
  dicc_data = {}

  for (y of my_bids_user){
    if (y.collInfo.slug in dicc_data){
      dicc_data[y.collInfo.slug].push(y)
    } else {
      dicc_data[y.collInfo.slug] = []
      dicc_data[y.collInfo.slug].push(y)
    }
  }
  return dicc_data
}

async function get_data_orders(){
  my_orders = await user_orders()
  dicc_data = {}

  for (x of my_orders) {
    const starting_price = x.pool.startingPrice
    const whitelist = new PublicKey(x.pool.whitelistAddress)
    const config = {
        poolType: tensorswap.PoolTypeAnchor.Token,
        curveType: tensorswap.CurveTypeAnchor.Exponential,
        startingPrice:  new BN(starting_price),
        delta:  new BN(0),
        mmCompoundFees: true,
        mmFeeBps: null,
    }

    const [tswapPda, tswapBump] = findTSwapPDA({});
    const [poolPda, poolBump] = findPoolPDA({
        tswap: tswapPda,
        owner: keypair.publicKey,
        whitelist: whitelist,
        poolType: poolTypeU8(tensorswap.PoolTypeAnchor.Token),
        curveType: curveTypeU8(tensorswap.CurveTypeAnchor.Exponential),
        startingPrice: new BN(starting_price),
        delta: new BN(0),
    });

    const order = await swapSdk.fetchPool(poolPda)
    const order_data = []
    order_data.push(config)
    order_data.push(order)

    dicc_data[whitelist] = order_data
  }
  return dicc_data
}

async function close_all_swaporders (){
  
  my_pools = await user_orders()
  var curve = tensorswap.CurveTypeAnchor.Exponential
  var ptype = tensorswap.PoolTypeAnchor.Token
  
  for (x of my_pools){
    console.log("Closing " + x.pool.address +" pool..")
    const price = x.pool.startingPrice
    const whitelist = x.pool.whitelistAddress
    if (x.pool.curveType == "EXPONENTIAL"){
      curve = tensorswap.CurveTypeAnchor.Exponential
    }
    else {
      curve = tensorswap.CurveTypeAnchor.Linear
    }
    if (x.pool.poolType == "TOKEN"){
      ptype = tensorswap.PoolTypeAnchor.Token
    }
    else if (x.pool.poolType == "NFT"){
      ptype = tensorswap.PoolTypeAnchor.Nft
    }
    else {
      ptype = tensorswap.PoolTypeAnchor.Trade
    }
    const config = {
      poolType: ptype,
      curveType: curve,
      startingPrice: new BN(price),
      delta: new BN(0),
      mmCompoundFees: true,
      mmFeeBps: null,
    }
    pool_close(config,keypair.publicKey,whitelist)
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  return "Task finished"
}

async function close_all_tcompbids(){
  my_bids = await user_bids()

  for (x of my_bids){
    bid_close(x.bid.address)
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

async function close_unmatching_pool(my_data){
  const whitelist_list = []
  for (x of my_data){
    const id = x.getId()
    const uuid = TensorWhitelistSDK.uuidToBuffer(id);
    const whitelist = findWhitelistPDA({uuid: uuid})[0];
    whitelist_list.push(whitelist._bn)
  }
  my_pools = await user_orders()
  var curve = tensorswap.CurveTypeAnchor.Exponential
  var ptype = tensorswap.PoolTypeAnchor.Token
  
  for (x of my_pools){
    const public_key_whitelist = new PublicKey(x.pool.whitelistAddress)
    let contador = 1 
    for (y of whitelist_list){
      if(String(public_key_whitelist._bn) == String(y)){
        contador = contador - 1 
      }
    }
    
    if (contador == 1){
      console.log("Closing " + x.pool.address +" pool..")
      const price = x.pool.startingPrice
      const whitelist = x.pool.whitelistAddress
      if (x.pool.curveType == "EXPONENTIAL"){
        curve = tensorswap.CurveTypeAnchor.Exponential
      }
      else {
        curve = tensorswap.CurveTypeAnchor.Linear
      }
      if (x.pool.poolType == "TOKEN"){
        ptype = tensorswap.PoolTypeAnchor.Token
      }
      else if (x.pool.poolType == "NFT"){
        ptype = tensorswap.PoolTypeAnchor.NFT
      }
      else {
        ptype = tensorswap.PoolTypeAnchor.Trade
      }
      const config = {
        poolType: ptype,
        curveType: curve,
        startingPrice: new BN(price),
        delta: new BN(0),
        mmCompoundFees: true,
        mmFeeBps: null,
      }
      pool_close(config,keypair.publicKey,whitelist)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return "Task finished"
}

async function close_unmatching_bids(my_data){
  my_bids = await user_bids()

  for (x of my_bids){
    var coincidence = false
    for (var i = 0; i < x.bid.attributes.length; i++) {
      for (var z = 0; z < my_data.length; z++) {
        for (var u = 0; u < my_data[z].getTraits().length; u++) {
          if (x.bid.attributes[i].trait_type == my_data[z].getTraits()[u].getType() && x.bid.attributes[i].value == my_data[z].getTraits()[u].getValue()){
            coincidence = true
          }
        }
      }
      console.log(coincidence)
    }

    if (!coincidence){
      bid_close(x.bid.address)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function listings (slug){
  let intentos5 = 10;
  let exito5 = false;
  while (intentos5 > 0 && !exito5) {
    try {
      const client = connect_apollo()
      const resp = await client.query({
          query: gql`
              query ActiveListingsPricesV2($slug: String!) {
                  activeListingsPricesV2(slug: $slug) {
                      prices {
                        owner
                        price
                        source
                        unit
                        tx {
                          mint {
                            onchainId
                            attributes {
                              trait_type
                              value
                            }
                          }
                        }
                    }
                  }
              }`,
          variables: {
              slug: String(slug)
          },
      });
      const results = await resp.data.activeListingsPricesV2.prices;

      results.sort((a, b) => a.price - b.price);
      
      exito5 = true
      return results
    } catch(error){
      console.log( '\x1b[31m' + "An error ocurred fetching lists" + error + '\x1b[0m')
      intentos5 --
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

//listings("62915557-51cd-48a4-913d-4ca55e8480d2")

async function listings_by_traits(slug,trait){
  let intentos5 = 10;
  let exito5 = false;
  
  while (intentos5 > 0 && !exito5) {
    try {
      const client = connect_apollo()
      const resp = await client.query({
          query: gql`
              query ActiveListingsPricesV2($slug: String!, $filters: ActiveListingsFilters) {
                  activeListingsPricesV2(slug: $slug, filters: $filters) {
                      prices {
                        owner
                        price
                        source
                        unit
                        tx {
                          mint {
                            onchainId
                            attributes {
                              trait_type
                              value
                            }
                          }
                        }
                    }
                  }
              }`,
          variables: {
              filters:{ traits: {traitType: trait.getType(), values: trait.getValue()}},
              slug: String(slug)
          },
      });

      const results = await resp.data.activeListingsPricesV2.prices;

      results.sort((a, b) => a.price - b.price);

      exito5 = true
      return results
    } catch(error){
       console.log( '\x1b[31m' + "An error ocurred fetching lists " + error + '\x1b[0m')
       intentos5 --
       await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

}

async function my_margin (lista_slug){
  let intentos6 = 5;
  let exito6 = false;
  while (intentos6 > 0 && !exito6) {
    try {
      const client = connect_apollo()
      const resp = await client.query({
        query: gql`
          query CollectionStats($slugs: [String!],
              $slugsMe: [String!],
              $slugsDisplay: [String!],
              $ids: [String!],
              $sortBy: String,
              $page: Int,
              $limit: Int,) {
            allCollections( slugs: $slugs,
                slugsMe: $slugsMe,
                slugsDisplay: $slugsDisplay,  
                ids: $ids,
                sortBy: $sortBy,
                page: $page,
                limit: $limit) {
              total
              collections {
                slug
                statsV2 {
                  buyNowPrice
                  sellNowPrice
                }
                name
              }   
            }
          }
        `,
        variables: {
          "slugs": lista_slug,
          "slugsMe": null,
          "slugsDisplay": null,
          "ids": null,
          "sortBy": null, 
          "limit": 50, 
          "page": null
        },
      });
      const results = await resp.data.allCollections.collections;
      exito6 = true
      //console.log(results)
      const lista_coll = []

      for (const c of results) {
        
        const bid_price = c.statsV2.sellNowPrice/1000000000
        const sell_price = c.statsV2.buyNowPrice/1000000000

        const margin = sell_price-bid_price
        const percent_margin = margin / sell_price * 100

        lista_coll.push([c.name, sell_price, margin, percent_margin])
      }

      lista_coll.sort(function(a, b) {return b[3] - a[3]});

      console.log("---------------------- "+"My margins"+" ----------------------")
      
      for (x of lista_coll){
        if (x[3] > 25){
        console.log(x[0] + " ->" + " FP: " + '\x1b[34m' + x[1] + ";" + '\x1b[0m' + " margin: " + '\x1b[32m' + x[2].toFixed(2) + " sol;" +  '\x1b[0m' + " % : " + '\x1b[32m'+ x[3].toFixed(2)+ " %" +  '\x1b[0m')
        }
        else if (x[3] > 10){
          console.log(x[0] + " ->" + " FP: " + '\x1b[34m' + x[1] + ";" + '\x1b[0m' + " margin: " + '\x1b[33m' + x[2].toFixed(2) + " sol;" +  '\x1b[0m' + " % : " + '\x1b[33m' + x[3].toFixed(2)+ " %" +  '\x1b[0m')
        }
        else{
          console.log(x[0] + " ->" + " FP: " + '\x1b[34m' + x[1] + ";" + '\x1b[0m' + " margin: " + '\x1b[31m' + x[2].toFixed(2) + " sol;" +  '\x1b[0m' + " % : " + '\x1b[31m' + x[3].toFixed(2)+ " %" +  '\x1b[0m')
        }
      }
    } catch(error){
      console.log( '\x1b[31m' + "Error checking my margins: " + error+ '\x1b[0m')
      intentos6 -- 
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function my_margin_traits (lista_slug_traits) {
  const final_margins = []
  for (lst of lista_slug_traits){
    var trait = lst[1][0]
    var listed_price = await listings_by_traits(lst[0],trait)

    if (!isNaN(listed_price[0].price)){
      const margin_t = listed_price[0].price/1000000000 - lst[2]
      const percent_margin_t = (margin_t / (listed_price[0].price/1000000000)) * 100

      final_margins.push([lst[3],trait,margin_t,percent_margin_t,listed_price[0].price/1000000000 ])
    } else {
      final_margins.push([lst[3],trait,0,0,"-"])
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  final_margins.sort(function(a, b) {return b[3] - a[3]});

  console.log("---------------------- "+"My margins (Traits)"+" ----------------------")
      
  for (a of final_margins){
    if (a[3] > 30){
      console.log(a[0] + ": " + a[1][0] + " -> " + a[1][1] + "  Lowest: " + '\x1b[34m' + a[4] + ";" + '\x1b[0m' + " margin: " + '\x1b[32m' + a[2].toFixed(2) + " sol;" +  '\x1b[0m' + " % : " + '\x1b[32m' + a[3].toFixed(2)+ " %" +  '\x1b[0m')
    }
    else if (a[3] > 15){
      console.log(a[0] + ": " + a[1][0] + " -> " + a[1][1] + "  Lowest: " + '\x1b[34m' + a[4] + ";" + '\x1b[0m' + " margin: " + '\x1b[33m' + a[2].toFixed(2) + " sol;" +  '\x1b[0m' + " % : " + '\x1b[33m' + a[3].toFixed(2)+ " %" +  '\x1b[0m')
    } else if (a[3] == 0) {
      console.log(a[0] + ": " + a[1][0] + " -> " + a[1][1] + "  Lowest: " + '\x1b[34m' + a[4] + ";" + '\x1b[0m' + " margin: " + a[2] + " sol;" +  " % : "  + a[3] + " %")
    } else{
      console.log(a[0] + ": " + a[1][0] + " -> " + a[1][1] + "  Lowest: " + '\x1b[34m' + a[4] + ";" + '\x1b[0m' + " margin: " + '\x1b[31m' + a[2].toFixed(2) + " sol;" +  '\x1b[0m' + " % : " + '\x1b[31m' + a[3].toFixed(2)+ " %" +  '\x1b[0m')
    }
  }
}


async function wallet_checker(wallets,timestamp){
  for (x of wallets){
    var all_results = []
    var batchs = 0
    var timestamp_query_while = Date.now()
    while (timestamp < timestamp_query_while && timestamp_query_while != null){
      var results = null
      if (batchs == 0){
        let intentos = 3;
        let exito = false;
        while (intentos > 0 && !exito) {
          try{
            const client = connect_apollo()
            const resp = await client.query({
              query: gql`
                query AllUserTransactionsV3($wallets: [String!]!, $filters: TransactionsFilters) {
                  allUserTransactionsV3(wallets: $wallets, filters: $filters) {
                    txs {
                      buyerId
                      grossAmount
                      mint {
                        collection {
                          name
                          slug
                        }
                      }
                    mintOnchainId
                    sellerId
                    txAt
                    txType
                    }
                    page {
                      endCursor {
                      txAt
                      txKey
                      }
                    }
                  }
                }
              `,
              variables: {
                "wallets": x,
                "filters": {"txTypes": ['SALE_BUY_NOW','SWAP_SELL_NFT','SWAP_BUY_NFT','SWAP_BUY_SINGLE_LISTING']},
              }
            });
          results = await resp.data.allUserTransactionsV3;
          exito = true
          } catch(error){
            intentos --
            console.log( '\x1b[31m' + "An error ocurred doing wallet checker query" + error+ '\x1b[0m')
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        timestamp_query = results.page.endCursor
        if (timestamp_query != null){
          timestamp_query_while = timestamp_query.txAt
          all_results.push(results.txs)
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        else{
          timestamp_query_while = null
        }
        console.log("Fetched tx batch number " + batchs)
        batchs +=1
        
      }
      else {
        let intentos = 3;
        let exito = false;
        while (intentos > 0 && !exito) {
          try {
            const client = connect_apollo()
            const resp = await client.query({
              query: gql`
                query AllUserTransactionsV3($wallets: [String!]!, $filters: TransactionsFilters,  $cursor: TransactionsCursorInput) {
                  allUserTransactionsV3(wallets: $wallets, filters: $filters,cursor: $cursor) {
                    txs {
                      buyerId
                      grossAmount
                      mint {
                        collection {
                          name
                          slug
                        }
                      }
                    mintOnchainId
                    sellerId
                    txAt
                    txType
                    }
                    page {
                      endCursor {
                      txAt
                      txKey
                      }
                    }
                  }
                }
              `,
              variables: {
                "wallets": x,
                "filters": {"txTypes": ['SALE_BUY_NOW','SWAP_SELL_NFT','SWAP_BUY_NFT','SWAP_BUY_SINGLE_LISTING']},
                "cursor":{"txAt": timestamp_query.txAt, "txKey": timestamp_query.txKey}
              }
            });
            results = await resp.data.allUserTransactionsV3;
            exito = true
          } catch(error){
            intentos --
            console.log(  '\x1b[31m' + "An error ocurred doing wallet checker query" + error + '\x1b[0m' )
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        timestamp_query = results.page.endCursor
        if (timestamp_query != null){
          timestamp_query_while = timestamp_query.txAt
          all_results.push(results.txs)
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        else{
          timestamp_query_while = null
        }
        console.log("Fetched tx batch number " + batchs)
        batchs +=1
      }
    }
    
    let dict_profits = {}
    let dict_nfts_per_collections = {}
    let dict_profits_collection = {}
    var volume = 0
    for (sublist of all_results){
      for (y of sublist){
        if (y.buyerId == x && y.sellerId != null && y.mint.collection != null){ //(y.txType == 'SALE_BUY_NOW' || y.txType == 'SWAP_SELL_NFT')
          if (y.grossAmount != null){
          volume += parseInt(y.grossAmount)/1000000000
          }
          if (y.mint.collection.name in dict_nfts_per_collections){
            dict_nfts_per_collections[y.mint.collection.name].push(y.mintOnchainId)
          }
          else{
            dict_nfts_per_collections[y.mint.collection.name] = []
            dict_nfts_per_collections[y.mint.collection.name].push(y.mintOnchainId)
          }

          if (y.mintOnchainId in dict_profits){
            dict_profits[y.mintOnchainId].push(-y.grossAmount)
          }
          else {
            dict_profits[y.mintOnchainId] = []
            dict_profits[y.mintOnchainId].push(-y.grossAmount)
          }
        }
        else if (y.sellerId == x && y.buyerId != null && y.mint.collection != null){ //(y.txType == 'SALE_BUY_NOW' || y.txType == 'SWAP_SELL_NFT')
          if (y.grossAmount != null){
            volume += parseInt(y.grossAmount)/1000000000
          }
          if (y.mint.collection.name in dict_nfts_per_collections){
            dict_nfts_per_collections[y.mint.collection.name].push(y.mintOnchainId)
          }
          else{
            dict_nfts_per_collections[y.mint.collection.name] = []
            dict_nfts_per_collections[y.mint.collection.name].push(y.mintOnchainId)
          }
          if (y.mintOnchainId in dict_profits){
            dict_profits[y.mintOnchainId].push(y.grossAmount)
          }
          else {
            dict_profits[y.mintOnchainId] = []
            dict_profits[y.mintOnchainId].push(y.grossAmount)
          }
        }
      }
    }

    var profit_total = 0
    var nft_holds = 0
    var nft_holds_value = 0
    var unknwow_profit = 0
    var unknwow_profit_value = 0
    var trades = 0
    for ( clave in dict_profits){
      var parsed =  await parseProfits(dict_profits[clave])
      var profit = parsed[0]
      
      if (parseInt(parsed[1]) % 2 == 0 ){
        dict_profits[clave] = parseInt(profit)/1000000000
        for (z in dict_nfts_per_collections){
          if (dict_nfts_per_collections[z].includes(clave) && z in dict_profits_collection){ 
              dict_profits_collection[z] += parseInt(profit)/1000000000
          }
          else if (dict_nfts_per_collections[z].includes(clave)) {
              dict_profits_collection[z] = parseInt(profit)/1000000000
          }
        }
        trades += 1
        profit_total += parseInt(profit)/1000000000
      }
      else if (parseInt(parsed[1]) % 2 != 0 && profit > 0){
        unknwow_profit += 1
        unknwow_profit_value += parseInt(profit)
        delete dict_profits[clave]
      }
      else if (parseInt(parsed[1]) % 2 != 0 && profit < 0){
        nft_holds += 1
        nft_holds_value += parseInt(-profit)
        delete dict_profits[clave]
      } else if (profit == null){
        delete dict_profits[clave]
      }
    }
    console.log("--------------------Profits by trades (Top 20)--------------------")
    let matriz2 = Object.entries(dict_profits);
    matriz2.sort((a, b) => b[1] - a[1]);
    let diccionarioOrdenado2 = Object.fromEntries(matriz2);

    var countdown2 = 20
    for (p in diccionarioOrdenado2){
      if (diccionarioOrdenado2[p] > 0 && countdown2 > 0){
        console.log(p + " result: " +  '\x1b[32m' + diccionarioOrdenado2[p].toFixed(4)+ ";" + '\x1b[0m')
      }
      else if ( countdown2 > 0){
        console.log(p + " result: " +  '\x1b[31m' + diccionarioOrdenado2[p].toFixed(4)+ ";" + '\x1b[0m')
      }
      countdown2 = countdown2 - 1
    }

    console.log("------------------Profits by collections (Top 20)------------------")
    
    let matriz = Object.entries(dict_profits_collection);
    matriz.sort((a, b) => b[1] - a[1]);
    let diccionarioOrdenado = Object.fromEntries(matriz);

    var countdown = 20
    for (t in diccionarioOrdenado){
      if (diccionarioOrdenado[t] > 0 && countdown > 0){
        console.log(t + " result: " +  '\x1b[32m' + diccionarioOrdenado[t].toFixed(4)+ ";" + '\x1b[0m')
      }
      else if ( countdown > 0){
        console.log(t + " result: " +  '\x1b[31m' + diccionarioOrdenado[t].toFixed(4)+ ";" + '\x1b[0m')
      }
      countdown = countdown - 1
    }

    console.log("----------------------------Final recap----------------------------")
    console.log("WALLET: "+ x + ";  TOTAL PROFIT: " + (profit_total).toFixed(2))
    console.log("Trades completed: " + trades + '     total volume: ' + volume.toFixed(2) + " sol")
    console.log("Only bought NFTs: " + nft_holds + "    spent: " + (nft_holds_value/1000000000).toFixed(2) + " sol")
    console.log("Only sold NFTs " + unknwow_profit + "    recauded: " + (unknwow_profit_value/1000000000).toFixed(2) + " sol")
    console.log("##########################################################################")
  }
  console.log("Task finished")
}

async function parseProfits (lista_precios){

  var result = 0
  for (w of lista_precios){
    result = result + parseInt(w)
  }

  if (isNaN(result)){
    return [0,lista_precios.length]
  } else{
    return [result,lista_precios.length]
  }
}

async function checkCollectionsDB(){

  const CollectionData = await new Promise((resolve, reject) => {
    db.all(`SELECT * FROM collections`, [], (err,rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

  console.log("--------------------------------------")

  for (coll of CollectionData){
    var ordersColl = await tswaporders(coll.collID)
    var listingsColl = await listings(coll.collID)

    var bid = ordersColl[0].sellNowPrice / 1000000000
    var fp = listingsColl[0].price / 1000000000
    
    var bidData = coll.bid
    var fpData = coll.fp

    var fpAcc = fp/fpData * 100
    var bidAcc = bid/bidData * 100

    console.log(coll.collID + " Real fp: " + fp + "  Data fp: " +fpData + "  Accurancy: " + fpAcc + " %")
    console.log(coll.collID + " Real bid: " + bid + "  Data bid: " +bidData + "  Accurancy: " + bidAcc + " %")

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log("Task finished.")
}

module.exports = {fetchslug, iterar_fila, leer_csv, new_opportunities, close_all_swaporders,listings,listings_by_traits,my_margin,my_margin_traits,user_orders,user_bids,close_unmatching_pool,wallet_checker,close_unmatching_bids,close_all_tcompbids}