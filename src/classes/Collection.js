const Trait = require("./Traits")

class Collection {
    constructor (arrayFila){
        this.nombre = arrayFila[0]

        if (arrayFila[1] == "0"){
            this.traits = []
        } else {

            const arrayTraits = []
            
            for (const t of arrayFila[1]) {
                const objTrait = new Trait(t[0],t[1])
                arrayTraits.push(objTrait)
            }

            this.traits = arrayTraits
        }

        this.amount = arrayFila[2]

        this.minPriceSol = arrayFila[3]
        this.maxPriceSol = arrayFila[4]
        this.mintInfo = arrayFila[5]
        this.slug = arrayFila[6]
        this.compressed = arrayFila[7]
        this.id = arrayFila[8]
        this.whitelist = null
        this.tolerance = arrayFila[9]
    }

    getNombre(){
        return this.nombre
    }

    getTraits(){
        return this.traits
    }

    getAmount(){
        return this.amount
    }

    getMinPriceSol(){
        return this.minPriceSol
    }

    getMaxPriceSol(){
        return this.maxPriceSol
    }

    getMintInfo(){
        return this.mintInfo
    }

    getSlug(){
        return this.slug
    }

    getCompressed(){
        return this.compressed
    }

    getId(){
        return this.id
    }

    getWhitelist(){
        return this.whitelist
    }

    getTolerance(){
        return this.tolerance
    }

    setWhitelist(wl){
        this.whitelist = wl
    }
}

module.exports = Collection