const fs = require("fs")
const got = require("got")
const jsdom = require("jsdom")
const csvStringify = require('csv-stringify')

const { JSDOM } = jsdom

const bggUrl = "https://boardgamegeek.com"

function sleep(duration) {
  return new Promise(resolve => setTimeout(resolve, duration))
}

// [{ name: "Gloomhaven", id: 174430, href: "https://boardgamegeek.com/..."}, ...]
async function getTopGames(page = 1) {
  const response = await got(`${bggUrl}/browse/boardgame/page/${page}`)
  const dom = new JSDOM(response.body)

  const anchors = Array.from(dom.window.document.querySelectorAll(".collection_objectname a"))
  const games = anchors.map(anchor => {
    const link = anchor.getAttribute("href")
    const name = anchor.textContent
    const match = link.match(/\/boardgame\/(\d+)/)
    const id = match[1]
    return {name, id, link: `${bggUrl}${link}`}
  })
  return games
}

// { field: "selector" } or
// { field: { selector: "str", retriever: function } }
const defaultRetriever = (elt) => elt?.textContent || ""
const desiredInfo = {
  name: 'name[primary="true"]',
  rank: { selector: 'rank[name="boardgame"]', retriever: (elt) => elt?.getAttribute("value") } || "",
  averageRating: "ratings average",
  bggRating: "ratings bayesaverage",
  numRatings: "usersrated",
  numOwned: "owned",
  weight: "averageweight",
  minPlayers: "minplayers",
  maxPlayers: "maxplayers",
  // time: "playingtime",
  minTime: "minplaytime",
  maxTime: "maxplaytime",
}

function scrapeGame(gameElt) {
  const gameId = gameElt.getAttribute("objectid")
  const record = { id: gameId }
  Object.entries(desiredInfo).forEach(([field, fetcher]) => {
    let selector = fetcher
    let retriever = defaultRetriever
    if (typeof fetcher === "object") {
      selector = fetcher.selector
      retriever = fetcher.retriever
    }
    const elt = gameElt.querySelector(selector)
    const value = retriever(elt)
    record[field] = value
  })
  record.link = `${bggUrl}/boardgame/${gameId}`
  return record
}

function scrapeGameXml(dom) {
  const gameElts = dom.window.document.querySelectorAll("boardgames > boardgame")
  const records = Array.from(gameElts).map(elt => scrapeGame(elt))
  return records
}

async function fetchGameInfo(games) {
  const gameIds = games.map(g => g.id)
  const gameUrl = `${bggUrl}/xmlapi/boardgame/${gameIds.join(',')}?stats=1`
  const response = await got(gameUrl)
  const dom = new JSDOM(response.body)
  return scrapeGameXml(dom)
}

async function getGames() {
  let games = []
  for (let i = 1; i <= 10; ++i) {
    await sleep(1000)
    console.log("getting top games page", i)
    games = games.concat(await getTopGames(i))
  }
  let gameInfos = []
  const stepSize = 20
  for (let i = 0; i < games.length; i += stepSize) {
    await sleep(1000)
    const gameGroup = games.slice(i, i + stepSize)
    console.log(`fetching ${i + 1} to ${i + stepSize}`)
    gameInfos = gameInfos.concat(await fetchGameInfo(gameGroup))
  }
  return gameInfos
}

async function exportCsv(games) {
  csvStringify(games, { header: true }, (err, output) => {
    fs.writeFileSync("output.csv", output)
  })
}

async function fetchAndOutput() {
  try {
    const games = await getGames()
    exportCsv(games)
  } catch (err) {
    console.error("error:", err)
  }
}

fetchAndOutput()
