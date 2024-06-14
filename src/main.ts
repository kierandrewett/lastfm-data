import axios from "axios";
import { config } from "dotenv";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

config();

const getTopTracks = async (page = 1) => {
    const getTopTracks = new URL("https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&format=json");
    getTopTracks.searchParams.set("user", process.env.LASTFM_API_USERNAME as any);
    getTopTracks.searchParams.set("api_key", process.env.LASTFM_API_KEY as any);
    getTopTracks.searchParams.set("limit", "1000");
    getTopTracks.searchParams.set("page", page.toString());

    const res = await axios.get(getTopTracks.href);

    const data = res.data.toptracks;

    return {
        data: data["track"] || [],
        page: data["@attr"].page,
        totalPages: data["@attr"].totalPages
    }
}

const getTrackTags = async (track: string, artist: string): Promise<string[]> => {
    const getTopTags = new URL("https://ws.audioscrobbler.com/2.0/?method=track.getTopTags&format=json");
    getTopTags.searchParams.set("track", track);
    getTopTags.searchParams.set("artist", artist);
    getTopTags.searchParams.set("autocorrect", "1");
    getTopTags.searchParams.set("api_key", process.env.LASTFM_API_KEY as any);

    const res = await axios.get(getTopTags.href);

    const data = res.data.toptags;

    return data ? Array.from(new Set(data.tag.filter(tag => tag.count > 3).filter(tag => tag.name.length < 15).filter(tag => /^[a-zA-Z- ]+$/.test(tag.name)).sort((a, b) => b.count - a.count).map(tag => [tag.count, tag.name.toLowerCase()]))) : [];
}

const getAllTopTracks = async (page = 1, tracks = [], totalPages = 1): Promise<any[]> => {
    if (page > totalPages) return tracks;

    const result = await getTopTracks(page);
    tracks = tracks.concat(result.data);

    await new Promise((r) => setTimeout(() => {
        r(1);
    }, 250));

    console.log(`${page}/${totalPages}: Getting next 1000 tracks (total ${tracks.length})`);

    return getAllTopTracks((+result.page) + 1, tracks, result.totalPages);
}

const format = (data: object) => {
    return JSON.stringify(data, null, 4)
}

const main = async () => {
    const tracks = await getAllTopTracks();

    const taggedTracks: [string, string, string, number, string[]][] = [];

    let trackI = 0;
    for await (const { name, artist, image, playcount } of tracks) {
        console.log(`${trackI + 1}/${tracks.length}: Downloading track data and tags.`);

        const tags = await getTrackTags(name, artist.name);

        taggedTracks.push([
            name,
            artist.name,
            image[image.length - 1]["#text"],
            +playcount,
            tags
        ]);

        console.log(`    ${name} by ${artist.name} (${playcount}): ${tags.join(", ")}`)

        trackI++;

        await new Promise((r) => setTimeout(() => {
            r(1);
        }, 250));

        await writeFile(resolve(process.cwd(), "tracks_data.json"), format(taggedTracks), "utf-8");
    }

    console.log("Saved to file!");
}

main();

const generateTopTags = async () => {
    const tracksDataPath = resolve(process.cwd(), "tracks_data.json");

    const tracksDataRaw = await readFile(tracksDataPath, "utf-8");
    const tracksData = JSON.parse(tracksDataRaw);

    let allTags = {};

    for (const track of tracksData) {
        const [tags] = track;

        for (const [score, tag] of tags) {
            if (!allTags[tag]) allTags[tag] = 0;

            allTags[tag] += score;
        }
    }

    await writeFile(resolve(process.cwd(), "top_tags.json"), format(allTags), "utf-8");
}

const auxMethod = process.argv[2];

if (auxMethod in globalThis && typeof globalThis[auxMethod] == "function") {
    (globalThis as any)[auxMethod]();
}