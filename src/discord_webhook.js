const { WebhookClient, EmbedBuilder } = require("discord.js");

const webhookClient = new WebhookClient({ id: '', token: '' });


async function nft_buy_message(slug,nft,price_i){
    var price = parseInt(price_i)/1000000000
    price = String(price)
    const embed = new EmbedBuilder()
	    .setTitle('Bid accepted in: ' + slug)
        .setFields({name: "Price", value: price, inline: false})
        .setURL('https://www.tensor.trade/item/'+ nft)
	    .setColor("#33C1FF");

    webhookClient.send({
        content: '',
        username: 'Bidder',
        embeds: [embed],
    })
}

async function nft_sell_message(slug,nft,price_i){
    var price = parseInt(price_i)/1000000000
    price = String(price)
    const embed = new EmbedBuilder()
	    .setTitle('NFT sold in: ' + slug)
        .setFields({name: "Price", value: price, inline: false})
        .setURL('https://www.tensor.trade/item/'+ nft)
	    .setColor("#33FF8D");

    webhookClient.send({
        content: '',
        username: 'Bidder',
        embeds: [embed],
    })
}

async function nft_list_message(slug,nft,price_i){
    var price = parseInt(price_i)/1000000000
    price = String(price)
    const embed = new EmbedBuilder()
	    .setTitle('NFT listed in : ' + slug)
        .setFields({name: "Price", value: price, inline: false})
        .setURL('https://www.tensor.trade/item/'+ nft)
	    .setColor("#FFFFFF");

    webhookClient.send({
        content: '',
        username: 'Bidder',
        embeds: [embed],
    })
}

async function out_of_range_message(slug,max_price,price_new_bid){
    var max_price = String(max_price)
    var price_new_bid = String(price_new_bid)

    const embed = new EmbedBuilder()
	    .setTitle('Collection bid out of range: ' + slug)
        .setFields({name: "My max:", value: max_price, inline: false},{name: "New bid:", value: price_new_bid, inline: false})
        .setURL('https://www.tensor.trade/trade/'+ slug)
	    .setColor("#FF3535");

    webhookClient.send({
        content: '',
        username: 'Bidder',
        embeds: [embed],
    })
}

//nft_buy_message("Bastards", "GctJkoZPMKzddJtuxBfqhHkyoA4fpGSuzJSDv5bCjJxH", 3145141331)
//nft_list_message("Bastards", "GctJkoZPMKzddJtuxBfqhHkyoA4fpGSuzJSDv5bCjJxH", "2.3")
//nft_sell_message("Bastards", "GctJkoZPMKzddJtuxBfqhHkyoA4fpGSuzJSDv5bCjJxH", "2.3")

module.exports = {nft_buy_message,nft_list_message,nft_sell_message,out_of_range_message}