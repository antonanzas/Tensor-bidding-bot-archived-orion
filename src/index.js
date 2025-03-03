const readline  = require('readline');
const sqlite3 = require("sqlite3").verbose()
let sql
const {iterar_fila,leer_csv, new_opportunities,close_all_swaporders,my_margin,my_margin_traits,user_orders,user_bids,close_unmatching_pool,wallet_checker,close_all_tcompbids,close_unmatching_bids} = require("./funciones_c");
const {keypair} = require("./common_c");
const {leer_unddercutter_data} = require("./undercutter_c");
const {bucle_websock_slugs} = require("./websock_lists");

const db = new sqlite3.Database("src/database.db", sqlite3.OPEN_READWRITE,(err) => {
    if (err) return console.error(err.message)
})

async function main(){

    //Borrar e iniciar bbdd

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run(`DROP TABLE IF EXISTS collections`, (err) => {
            if (err) return console.error(err.message);
        })

        db.run(`CREATE TABLE collections(id INTEGER PRIMARY KEY,collID, bid, fp, diff)`, (err) => {
            if (err) return console.error(err.message);
        })

        db.run('COMMIT', (err) => {
            if (err) return console.error(err.message);
        });
    })

    //Leer csv data

    const datos = await leer_csv()
    const undercut_data = await leer_unddercutter_data()

    // Recopilar traits por colleccion

    let dicc_slugsTraits = {}

    for (x of datos){
        if (x.getSlug() in dicc_slugsTraits){
            dicc_slugsTraits[x.getSlug()].push(x.getTraits())
        } else {
            dicc_slugsTraits[x.getSlug()] = [x.getTraits()]
        }
      
    }
    for (y of undercut_data){
        if (y.getSlug() in dicc_slugsTraits){
            dicc_slugsTraits[y.getSlug()].push(y.getTraits())
        } else {
            dicc_slugsTraits[y.getSlug()] = [y.getTraits()]
        }
    }

    //Iniciar funciones

    console.log("--------------------------------------------------------------")
    bucle_websock_slugs(dicc_slugsTraits,undercut_data)
    iterar_fila(datos)
}

async function only_undercut(){
    let dicc_slugsTraits = {}
    const undercut_data = await leer_unddercutter_data()
    for (y of undercut_data){
        if (y.getSlug() in dicc_slugsTraits){
            dicc_slugsTraits[y.getSlug()].push([y.getTraits()])
        } else {
            dicc_slugsTraits[y.getSlug] = [y.getTraits()]
        }
    }
    bucle_websock_slugs(dicc_slugsTraits,undercut_data)
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function pregunta(pregunta) {
    return new Promise((resolve) => {
      rl.question(pregunta, (respuesta) => {
        resolve(respuesta);
      });
    });
}

async function menu_principal(){
    var n_my_orders = await user_orders()
    var n_my_orders = n_my_orders.length

    var n_my_bids = await user_bids()
    var n_my_bids = n_my_bids.length
    
    
    console.log("___________________________________________") 
    console.log("  ____    ____     _____    ____   __   __   "); 
    console.log(" / __ \\  |  __ \\  |_   _|  / __ \\  | \\ | |  ");
    console.log("| |  | | | |__) |   | |   | |  | | |  \\| |  "); 
    console.log("| |__| | |  _  /   _| |_  | |__| | | |\\  |  "); 
    console.log(" \\____/  |_| \\_\\  |_____|  \\____/  |_| \\_|  ");
    console.log("___________________________________________") 
    console.log(" ") 


    console.log("User wallet: " + "\x1b[36m" + keypair.publicKey + "\x1b[0m" )
    console.log("Priority fee (MicroLamports): " + "\x1b[36m" + "50k" + "\x1b[0m" )
    console.log("Active orders: " + "\x1b[36m" + n_my_orders + "\x1b[0m" )
    console.log("Active bids (traits): " + "\x1b[36m" + n_my_bids + "\x1b[0m" )

    console.log("_______________")
    console.log(" ") 

    console.log("1 -> Fetch new slugs ")
    console.log("2 -> Fetch new opportunities ")
    console.log("3 -> Check my margins ")
    console.log("4 -> Start collection bidding & undercut")
    console.log("5 -> Undercut only ")
    console.log("6 -> Close orders ")
    console.log("7 -> Delist all") 
    console.log("8 -> Wallet Tensor History ")
    console.log("9 -> Settings ")  

    rl.question(' ', (answer) => {

    switch(answer){
        case "1":
            console.log("Edit CSV properly if u have new slugs, then restart Orion")
            console.log("Fetching... ");
            leer_csv()
            rl.close();
            break;
        
        case "2":
            opp_menu()
            break;
        case "3":
            my_margin_run()
            break;
        case "4":
            main()
            rl.close();
            break;
        case "5":
            only_undercut()
            break
        case "6":
            close_orders_run()
            break
        case "7":
            console.log("Under development ");
            rl.close();
                break;
        case "8":
            checker_menu()
            break;
        case "9":
            console.log("Settings ");
            rl.close();
            break;
    }
  });
}

async function my_margin_run(){
    let lista_slug = []
    lista_slug_traits = []
    const datos2 = await leer_csv()
    for (x of datos2){
        if (x.getTraits().length == 0){
            lista_slug.push(x.getSlug())
        } else{
            lista_slug_traits.push([x.getSlug(),x.getTraits(),x.getMaxPriceSol(),x.getNombre()]) // [slug,traits,max_price,NombreColeccion]
        }
    }
    
    my_margin(lista_slug)
    my_margin_traits(lista_slug_traits)

    rl.question('Click enter when finished to return menu'+ "\n", () => {
        menu_principal()
    });
}



async function close_orders_run(){
    const close = await pregunta('Do you want to close all orders (1) or not matching orders (2) ')

    if (close == 1){
        const close2 = await pregunta('All orders -> Collection orders (1) Trait bids (2) All (3)')
        if (close2 == 1){
            const finished = await close_all_swaporders()
            console.log(finished)
        } else if (close2 == 2){
            close_all_tcompbids()
        } else {
            close_all_tcompbids()
            const finished = await close_all_swaporders()
        }
        
        rl.question('Click enter when finished to return to menu ', () => {
            menu_principal()
        });
    }
    else {
        const close3 = await pregunta('Not matching -> Collection orders (1) Trait bids (2) Both (3)')
        const datos = await leer_csv()
        if (close3 == 1){
            const finished_2 = await close_unmatching_pool(datos)
            console.log(finished_2)
        } else if (close3 == 2){
            close_unmatching_bids(datos)
        } else {
            close_unmatching_bids(datos)
            const finished_2 = await close_unmatching_pool(datos)
        }
        
        
        rl.question('Click enter when finished to return to menu ', () => {
            menu_principal()
        });
    }
}

async function opp_menu(){
    const sol = await pregunta('What is the max sol u want to spend? ')
    var amount = await pregunta('How many collections do u want to check? 50-100-150-200-... ')
    amount = amount / 50
    const time = await pregunta('Do u want to filter by 1h, 24h or 7 days volume? (Input only the number -> 1,24,7) ')
    const minimum_sol_margin = await pregunta('Do you want to set minimum SOL margin? (0 to skip, or specify the amount) ')
    const minimum_percent_margin = await pregunta("Do you want to set minimum % margin? (0 to skip, otherwise specify number; DO NOT INCLUDE '%') ")
    console.log("Fetching data.. ")
    const opp = await new_opportunities(sol, amount, time, minimum_sol_margin,minimum_percent_margin)
    rl.question('Click enter', () => {
        menu_principal()
    });
}

async function checker_menu(){
    const days = await pregunta('How many days do u want to go back? ')
    var fechaHoy = new Date();
    fechaHoy.setDate(fechaHoy.getDate() - days);
    var timestamp = fechaHoy.getTime();
    const bool_wallets = await pregunta('Do u want to check usual wallets (1) or a new wallet (2) ? ')

    wallets = []

    if (bool_wallets == 2){
        const new_wallet = await pregunta('Introduce public key of the new wallet ')
        wallet_checker([new_wallet], timestamp)
        rl.question('Click enter when finished to return menu', () => {
            menu_principal()
        });
    }
    else {
        wallet_checker(wallets, timestamp)
        rl.question('Click enter when finished to return menu', () => {
            menu_principal()
        });
    }
}
    
menu_principal()