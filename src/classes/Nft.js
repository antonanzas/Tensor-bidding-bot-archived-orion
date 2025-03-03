const Trait = require("./Traits")

class Nft {
    constructor(arrayFila){

        this.slug = arrayFila[0]
        this.mintAddress = arrayFila[1]
        this.listed = arrayFila[2]
        this.minPriceSol = arrayFila[3]
        if (arrayFila[4] == 0) {
            this.trait = []
        } else {
            this.trait = new Trait(arrayFila[4][0],arrayFila[4][1] )
        }
        this.fpTraits = null
    }

    getSlug(){
        return this.slug
    }

    getMintAddress(){
        return this.mintAddress
    }

    getListed(){
        return this.listed
    }

    getMinPriceSol(){
        return this.minPriceSol
    }

    getTraits(){
        return this.trait
    }

    getMinPriceLamports(){
        return this.getMinPriceSol()* parseInt(1000000000)
    }

    getFpTraitsLamports(){
        return this.fpTraits
    }

    getFpTraitsSol(){
        return this.getFpTraitsLamports() / parseInt(1000000000)
    }

    setFpTraitsLamports(fpTraits){
        this.fpTraits = fpTraits
    }

}

module.exports = Nft