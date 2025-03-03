const fs = require('fs');
const csv = require('csv-parser');
const Nft = require("./classes/Nft")

async function leer_unddercutter_data() {
    return new Promise((resolve) => {
        const arrayFinal = [];
        fs.createReadStream('./data/undercutter_data.csv')
          .pipe(csv())
          .on('data', (fila) => {
            const arrayFila = Object.entries(fila).map(([columna, valor]) => {
              return convertirSegunColumnaUndercut(columna, valor);
            });

            const NftToSell = new Nft(arrayFila)

            arrayFinal.push(NftToSell);
          })
          .on('end', () => {
            resolve(arrayFinal);
          })
    });
}

function convertirSegunColumnaUndercut(columna,valor){
  switch (columna) {
    case 'slug':
      return valor.toString(); 
    case 'mint_add':
      return valor.toString();
    case 'listed':
      if (valor == '1') {
        return true
      }
      else {
        return false
      }
    case 'min':
      return valor.toString();
    case 'traits':
      if (valor == '0') {
        return valor.toString()
      }
      else {
      const array_traits = valor.split(':')
      return array_traits
      }
  }
}

module.exports = {leer_unddercutter_data}