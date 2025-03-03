const { gql } = require("@apollo/client");
const sqlite3 = require("sqlite3").verbose()
let sql
const { createClient } = require("graphql-ws");
const WebSocket = require('ws');
const {keypair} = require("./common_c");
const {list_adjust} = require("./listing_tx/listing_adjust_c");
const {list_nft} = require("./listing_tx/list_nft");
const {listings, listings_by_traits, user_orders} = require("./funciones_c")
const {nft_buy_message,nft_sell_message,nft_list_message} = require("./discord_webhook");
const { orderedList } = require("discord.js");
const Nft = require("./classes/Nft")


const API_KEY = ""
const WSS_URL = "wss://api.tensor.so/graphql"

const db = new sqlite3.Database("src/database.db", sqlite3.OPEN_READWRITE,(err) => {
  if (err) return console.error(err.message)
})

async function websock_lists(slug,slugTraits,my_nfts) {
  var lowest_list = await listings(slug)
  const parsedSlug = slug.replace(/-/g, '');
  var nombretabla =  "LISTS_" + parsedSlug

  // console.log(lowest_list[0])
  // console.log(lowest_list[0].price)
  try {
    // Insert data

    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      //Añadir a la tabla coleccion CollID,fp

      db.run('INSERT INTO collections (collID, bid, fp, diff) VALUES (?,?,?,?)', [slug,null,lowest_list[0].price/1000000000,null], (err) => {
        if (err) return console.error(err.message)
      });

      //Eliminar si existe la tabla Lists de esta coleccion

      db.run(`DROP TABLE IF EXISTS ${nombretabla}`, function (err) {
        if (err) return console.error(err.message);
      })

      //Crear la tabla LISTS de esta coleccion

      sql = `CREATE TABLE ${nombretabla} (id INTEGER PRIMARY KEY, mint, price)`
      db.run(sql)

      //Insertar todas los listados en LISTS (orderbook)
    
      const stmt = db.prepare(`INSERT INTO ${nombretabla} (mint,price) VALUES (?,?)`);
      lowest_list.forEach(fila => stmt.run(fila.tx.mint.onchainId, parseFloat(fila.price)/1000000000));
      
      stmt.finalize();
    
      db.run('COMMIT', (err) => {
        if (err) return console.error(err.message)
      })
    })
  } catch(error) {
    console.log('\x1b[31m' +  "An error ocurred in websock list, working with DB:  " + error +  '\x1b[0m')
  }

  try{
    const clientOptions = {
      url: WSS_URL,
      webSocketImpl: WebSocket,
      connectionParams: {
        "X-TENSOR-API-KEY": API_KEY
      }
    };
    const client = createClient(clientOptions);
    const subscription = client.iterate({
      query: `subscription newTransactionTV2($slug: String!) {
        newTransactionTV2(slug: $slug) {
          mint {
            attributes {
              trait_type
              value
            }
          }
          tx {
            grossAmount
            buyerId
            mintOnchainId
            poolOnchainId
            sellerId
            source
            txType
          }
        }
      }`,
      variables: {
        slug: slug
      },
      operationName: 'newTransactionTV2'
    });

    var listed_nft = []
    var u_floor = parseInt(lowest_list[0].price)-parseInt(1)
    
    for (x of my_nfts){
      if (x.getTraits().length == 0){

        //var min_price = parseFloat(x[3]) * parseInt(1000000000)

        if (slug == x.getSlug() && lowest_list[0].tx.mint.onchainId != x.getMintAddress()){
          //listed_nft.push([x[1],min_price,x[4]])
          listed_nft.push(x)
          if (x.getListed()){
            if (u_floor > x.getMinPriceLamports()){
              console.log("Adjusting nft: " + x.getMintAddress() + " at "  + "\x1b[35m"+ u_floor/1000000000 + "\x1b[0m")
              const adjusted = await list_adjust(u_floor,keypair,x.getMintAddress())
              console.log(adjusted)
            } else{
              console.log("Min listed out of range; Relisting: " + x.getMintAddress() + " at " + "\x1b[35m" + x.getMinPriceSol()+ "\x1b[0m")
              const adjusted = await list_adjust(x.getMinPriceLamports(),keypair,x.getMintAddress())
              console.log(adjusted)
            }
          }
          else if (u_floor > x.getMinPriceLamports()){
            const listed = await list_nft(u_floor,keypair,x.getMintAddress())
            console.log(listed)
          }
          else {
            console.log("Min listed out of range; Listing: " + x.getMintAddress() + " at "+ "\x1b[35m" + x.getMinPriceLamports() + "\x1b[0m")
            const listed = await list_nft(x.getMinPriceLamports(),keypair,x.getMintAddress())
            console.log(listed)
          }
        } else if (slug == x.getSlug()) {
          //listed_nft.push([x[1],min_price,x[4]])
          listed_nft.push(x)
          console.log("\x1b[32m"+ "You have the lowest list: " + x.getSlug() + "\x1b[0m")
        }
      } else {

        if (slug == x.getSlug()) {
          console.log("Listed by traits")
          var lowest_list_by_traits = await listings_by_traits(slug,x.getTraits())
          var u_floor_by_traits = parseInt(lowest_list_by_traits[0].price)-parseInt(1)
        }

        //var min_price = parseFloat(x[3]) * parseInt(1000000000)

        if (slug == x.getSlug() && lowest_list_by_traits[0].tx.mint.onchainId != x.getMintAddress()){

          //listed_nft.push([x[1],min_price,x[4],u_floor_by_traits])
          x.setFpTraitsLamports(u_floor_by_traits)
          listed_nft.push(x)

          if (x.getListed()){
            if (u_floor_by_traits > x.getMinPriceLamports()){
            console.log("Adjusting nft: " + x.getMintAddress() + " at " + "\x1b[35m"+  u_floor_by_traits/1000000000 +  "\x1b[0m")
            const adjusted = await list_adjust(u_floor_by_traits,keypair,x.getMintAddress())
            console.log(adjusted)
            } else {
              console.log("Min listed out of range; Relisting: " + x.getMintAddress() + " at " + "\x1b[35m"+ x.getMinPriceSol() + "\x1b[0m")
              const adjusted = await list_adjust(x.getMinPriceLamports(),keypair,x.getMintAddress())
              console.log(adjusted)
            }
          }
          else if (u_floor_by_traits > x.getMinPriceLamports()){
            const listed = await list_nft(u_floor_by_traits,keypair,x.getMintAddress())
            console.log(listed)
          }
          else {
            console.log("Min listed out of range; Listing: " + x.getMintAddress() + " at " + x.getMinPriceSol() + " sol")
            const listed = await list_nft(x.getMinPriceLamports(),keypair,x.getMintAddress())
            console.log(listed)
          }
        }  else if (slug == x.getSlug()) {
          console.log("\x1b[32m"+ "You have the lowest list in " + x.getTraits().getType() + " -> "+ x.getTraits().getValue() + "\x1b[0m")
          
          //listed_nft.push([x[1],min_price,x[4],u_floor_by_traits + parseInt(1)])
          x.setFpTraitsLamports(u_floor_by_traits + parseInt(1))
          listed_nft.push(x)
        }
      }
    }
    
    var nft_owned = false
    var contador = 0

    if (listed_nft.length > 0){
      nft_owned = true
      contador = parseInt(listed_nft.length)
    }

    //console.log("New transactions for: " + slug +" connected");
      
    for await (const event of subscription) {

      //Leer db antes de cada evento

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

      const orderbookLists = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${nombretabla} ORDER BY price ASC`, [], (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });

      if (rows != undefined){
        rows.forEach(row => {
          bid = row.bid
          diff = row.diff;
        });
      }
        
      const price = event.data.newTransactionTV2.tx.grossAmount
      const buyer = event.data.newTransactionTV2.tx.buyerId
      const seller = event.data.newTransactionTV2.tx.sellerId
      const nft = event.data.newTransactionTV2.tx.mintOnchainId
      const tx_type = event.data.newTransactionTV2.tx.txType
      const diff_percent = price/u_floor * 100
      let nft_triggered = null
      const traits = event.data.newTransactionTV2.mint.attributes

      //Clasificar si tiene algún trait de mi lista

      var interesting_trait = []

      for (var i = 0; i < traits.length; i++) {
        for (var u = 0; u < slugTraits.length; u++) {
          if (slugTraits[u].length == undefined){ 
            if ( traits[i].trait_type.toLowerCase() == slugTraits[u].getType().toLowerCase() && traits[i].value.toLowerCase() == slugTraits[u].getValue().toLowerCase()) {
              interesting_trait.push(slugTraits[u])
            }
          } else if ( slugTraits[u].length != 0 && slugTraits[u][0].length != 0  ){ 
            for (var a = 0; a < slugTraits[u].length; a++){
              try {
                if ( traits[i].trait_type.toLowerCase() == slugTraits[u][a].getType().toLowerCase() && traits[i].value.toLowerCase() == slugTraits[u][a].getValue().toLowerCase()) {
                  interesting_trait.push(slugTraits[u][a])
                }
              } catch(error) {
                console.log('\x1b[31m' +  "TRAIT ERROR: " + error  +  '\x1b[0m')
              }
            }
          }
        }   
      }
      //console.log("INTERESTING TRAITS:")
      //console.log(interesting_trait)


      //Clasificar si se debe cambiar algún trait list y editarlo

      if (seller != keypair.publicKey){
        for (var i = 0; i < traits.length; i++) {
          for (z of listed_nft){
            if (z.getTraits().length != 0){ 
              if (price/1000000000 > z.getMinPriceSol() && price/1000000000 < z.getFpTraitsSol() && traits[i].trait_type.toLowerCase() == z.getTraits().getType().toLowerCase() && traits[i].value.toLowerCase() == z.getTraits().getValue().toLowerCase()) {
                const edit_price_by_traits = parseInt(price) - parseInt(1)
                if (edit_price_by_traits != undefined && edit_price_by_traits != null && edit_price_by_traits > 0){
                  z.setFpTraitsLamports(edit_price_by_traits)
                  console.log("Editing list with trait " + z.getTraits().getType() + " -> " + z.getTraits().getValue() + " at " + z.getFpTraitsSol()+ " sol")
                  const adjust2 = await list_adjust(edit_price_by_traits,keypair,z.getMintAddress())
                  console.log(adjust2)
                  }
              }
            }
          }
        }
      }

      //console.log(u_floor)
      //console.log(price)
      //console.log(diff_percent)
      //console.log(listed_nft)
      //console.log(nft_owned)
      //console.log("----------------------------------------2")

      // Ver si mis bids en esta coleccion han sido aceptadas para añadirlas a los listados
        
      if (buyer == keypair.publicKey){
        console.log("\x1b[32m" + "NFT bought: " + nft + " for " + price/1000000000 + " sol." +  "\x1b[0m")
        nft_buy_message(slug,nft,price)
        if (interesting_trait.length >= 1){
          var best_price_trait = 0
          var final_trait = null
          for (c of interesting_trait){
            console.log(c)
            var lowest_list_by_traits = await listings_by_traits(slug,c)
            var u_floor_by_traits = parseInt(lowest_list_by_traits[0].price)-parseInt(1)
            if (u_floor_by_traits > best_price_trait ) {
              best_price_trait = u_floor_by_traits
              final_trait = c
            }
          }
          console.log("Final trait: ")
          console.log(final_trait)

          if (best_price_trait != undefined && best_price_trait != null && best_price_trait > price){
            //listed_nft.push([nft,price,final_trait,best_price_trait])
            const nftComprado = new Nft([slug,nft,true,price/1000000000,[final_trait.getType(),final_trait.getValue()]])
            nftComprado.setFpTraitsLamports(best_price_trait)
            listed_nft.push(nftComprado)

            const listed2 = await list_nft(best_price_trait,keypair,nft)
            nft_list_message(slug,nft,best_price_trait)
            console.log(listed2)
            nft_owned = true
            contador += 1
          } else {
            console.log('\x1b[31m' + "LISTING WITH PRICE NULL OR LOWER THAN BUY PRICE: " + u_floor_by_traits +  '\x1b[0m')
          }

        // } else if (interesting_trait.length == 1){
        //   console.log(interesting_trait)
        //   var lowest_list_by_traits = await lowest_listed_by_traits(slug,interesting_trait)
        //   var u_floor_by_traits = parseInt(lowest_list_by_traits.price)-parseInt(1)
          
        //   if (u_floor_by_traits != undefined && u_floor_by_traits != null && u_floor_by_traits > price){
        //     listed_nft.push([nft,price,interesting_trait,u_floor_by_traits])
        //     const listed2 = await list_nft(u_floor_by_traits,keypair,nft)
        //     nft_list_message(slug,nft,u_floor_by_traits)
        //     console.log(listed2)
        //     nft_owned = true
        //     contador += 1
        //   } else {
        //     console.log('\x1b[31m' +  "LISTING WITH PRICE NULL OR LOWER THAN BUY PRICE: " + u_floor_by_traits +  '\x1b[0m')
        //   }
          
        } else {
          const lowest_list2 = await listings(slug)
          var u_floor = parseInt(lowest_list2[0].price)-parseInt(1)
          listed_nft.push(new Nft([slug,nft,true,price/1000000000,0]))
          const listed2 = await list_nft(u_floor,keypair,nft)
          nft_list_message(slug,nft,u_floor)
          console.log(listed2)
          nft_owned = true
          contador += 1
        }
      }


      // Ver si han hecho undercut del floor y si es así editar mis listados de floor 

      if (nft_owned == true && (tx_type == "LIST" || tx_type == "ADJUST_PRICE") && price/1000000000 <= u_floor/1000000000 && seller != keypair.publicKey && diff_percent > 80){
        nft_triggered = nft
        // console.log(seller + " at: " + price/1000000000 + " undercutted your NFT")
        const edit_price = parseInt(price) - parseInt(1)
        for (z of listed_nft){
          
          if ( edit_price > z.getMinPriceLamports() && z.getTraits().length == 0){
            console.log("Editing " + z.getMintAddress() + "  at: " + "\x1b[35m" + edit_price/1000000000 +  "\x1b[0m")
            if ( edit_price > 0.01 && edit_price != null && edit_price != undefined && !isNaN(edit_price)){
              const adjust2 = await list_adjust(edit_price,keypair,z.getMintAddress())
              console.log(adjust2)
              //console.log( "NFT ABOVE: " + nft_triggered)
            } else {
              console.log(event.data.newTransactionTV2.tx)
              console.log(price)
              console.log('\x1b[31m' + edit_price + '\x1b[0m')
            }
            
          }
          else if (z.getTraits().length == 0){
            console.log("Editing " + z.getMintAddress() + " listing at: " + "\x1b[35m" + z.getMinPriceSol() +  "\x1b[0m" )
            if ( z.getMinPriceLamports() > 0.01 && z.getMinPriceLamports() != null &&z.getMinPriceLamports() != undefined && !isNaN(z.getMinPriceLamports())){
              const adjust2 = await list_adjust(z.getMinPriceLamports(),keypair,z.getMintAddress())
              console.log(adjust2)
              // console.log( "NFT ABOVE: " + nft_triggered)
            } else {
              console.log(z)
              console.log(event.data.newTransactionTV2.tx)
              console.log(price)
              console.log('\x1b[31m' + z.getMinPriceLamports() + '\x1b[0m')
            }
          }
        }
        u_floor = edit_price
      }

      // Ver si he vendido algún listado y si es así eliminarlo de mi lista


      if (seller == keypair.publicKey && buyer!= null){
        nft_sell_message(slug,nft,price)
        console.log("\x1b[32m" + "NFT sold: " + nft + " for " + price/1000000000 + " sol." + "\x1b[0m")
        listed_nft = listed_nft.filter(function(sublista) {
          return sublista.getMintAddress() !== nft;
          });
        if (listed_nft.length == 0){
          nft_owned = false
        }
      }
      if (price/1000000000 < u_floor/1000000000 && (tx_type == "LIST" || tx_type == "ADJUST_PRICE") && diff_percent > 80){
        u_floor =  parseInt(price) - parseInt(1)
        //console.log(u_floor)
      }

      // Checkear y editar DB

      try{

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        if (tx_type == "LIST") {
          db.run(`INSERT INTO ${nombretabla} (mint, price) VALUES (?, ?)`, [nft, parseInt(price)/1000000000], (err) => {
            if (err) return console.error(err.message + nombretabla);
          });
        } else if ( tx_type == "ADJUST_PRICE") {

          sql =`UPDATE ${nombretabla} SET price = ? WHERE mint = ?`
          db.run(sql,[parseInt(price)/1000000000,nft],(err) => {
            if (err) return console.error(err.message)
          })

        }  else if (tx_type == "SALE_BUY_NOW" || tx_type == 'SWAP_BUY_NFT' ||   tx_type == "SALE_ACCEPT_BID" || tx_type == "SWAP_BUY_SINGLE_LISTING" || tx_type == "SWAP_SELL_NFT" || tx_type == "DELIST") {
          
          db.run(`DELETE FROM ${nombretabla} WHERE mint = ?`, [nft], (err) =>  {
            if (err) return console.error(err.message + nombretabla)
          });
        }

        db.all(`SELECT * FROM ${nombretabla} ORDER BY price ASC`, [], (err, rows) => {
          if (err) return console.error(err.message + nombretabla)

          if (orderbookLists[0].price != rows[0].price ) {
            diff = bid / rows[0].price;

            sql =`UPDATE collections SET fp = ?, diff = ? WHERE collID = ?`
            db.run(sql,[rows[0].price,diff,slug],(err) => {
              if (err) return console.error(err.message)
            })
          }
        });

        db.run('COMMIT', (err) => {
          if (err) return console.error(err.message + " en tx event de lists")
        })
      })
      } catch(error){
        console.log('\x1b[31m' + "Error updating lists events:" + error + '\x1b[0m')
      }
    } 
  } catch(error){
     console.log('\x1b[31m' +  "An error ocurred in websock lists: " + error + '\x1b[0m')
  }
}

// TX TYPES:
// SWAP_SELL_NFT -> SALE
// SWAP_BUY_NFT -> BUY
// LIST -> LIST


//SOURCES:
// TENSORSWAP
// MAGICEDEN_V2

async function bucle_websock_slugs(dicc_slugsTraits,datos){
  var contador = 0
  for (slug in dicc_slugsTraits){
    try{
      websock_lists(slug,dicc_slugsTraits[slug],datos)
    } catch(error){
      console.log('\x1b[31m' +  "An error ocurred in websock list: " + error +  '\x1b[0m')
    }

    //Cooldown cada 2 colecciones para no llegar al ratelimit
    contador += 1

    if (contador == 2){
      await new Promise(resolve => setTimeout(resolve, 10000));
      contador = 0
    }
  }
}

module.exports = {bucle_websock_slugs}