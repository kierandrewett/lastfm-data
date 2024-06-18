import axios, { all } from "axios";
import { config } from "dotenv";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

config();

const getTopTracks = async (page = 1, period?: string) => {
    const getTopTracks = new URL("https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&format=json");
    getTopTracks.searchParams.set("user", process.env.LASTFM_API_USERNAME as any);
    getTopTracks.searchParams.set("api_key", process.env.LASTFM_API_KEY as any);
    getTopTracks.searchParams.set("limit", "1000");
    getTopTracks.searchParams.set("page", page.toString());
    if (period) getTopTracks.searchParams.set("period", period.toString());

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

    return data ? Array.from(new Set(data.tag
        .filter(tag => tag.count > 3)
        .filter(tag => tag.name.length < 15)
        .filter(tag => tag.name.length >= 3)
        .filter(tag => /^[a-zA-Z- ]+$/.test(tag.name))
        .sort((a, b) => b.count - a.count)
        .map(tag => [tag.count, tag.name.trim().toLowerCase()])
    )) : [];
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

const getTopTracksForPeriod = async (period: string, page = 1, tracks = [], totalPages = 1): Promise<any[]> => {
    if (page > totalPages) return tracks;

    const result = await getTopTracks(page, period);
    tracks = tracks.concat(result.data);

    await new Promise((r) => setTimeout(() => {
        r(1);
    }, 250));

    console.log(`${page}/${totalPages}: Getting next 1000 tracks for ${period} period (total ${tracks.length})`);

    return getTopTracksForPeriod(period, (+result.page) + 1, tracks, result.totalPages);
}

const format = (data: object) => {
    return JSON.stringify(data, null, 4)
}

const writeTracksToFile = async (file_name: string, tracks: any[]) => {
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
        }, 50));

        await writeFile(resolve(process.cwd(), `${file_name}.json`), format(taggedTracks), "utf-8");
    }

    console.log("Saved to file!");

    return taggedTracks;
}

const generateTopTags = async (file_prefix: string, tracksData: any[]) => {
    let allTags = {};

    for (const track of tracksData) {
        const [name, artist, imageURL, playCount, tags] = track;

        for (const [score, tag] of tags) {
            if (!allTags[tag]) allTags[tag] = 0;

            allTags[tag] += score;
        }
    }

    console.log(allTags);

    const sortedAllTags = Object.fromEntries(
        Object.entries(allTags).sort(([_a,a],[_b,b]) => (b as number) - (a as number))
    );

    await writeFile(resolve(process.cwd(), `${file_prefix}_tags.json`), format(sortedAllTags), "utf-8");

    await writeFile(resolve(process.cwd(), `${file_prefix}_10_tags.json`), format(Object.keys(sortedAllTags).slice(0, 10)), "utf-8");
    await writeFile(resolve(process.cwd(), `${file_prefix}_50_tags.json`), format(Object.keys(sortedAllTags).slice(0, 50)), "utf-8");
    await writeFile(resolve(process.cwd(), `${file_prefix}_250_tags.json`), format(Object.keys(sortedAllTags).slice(0, 250)), "utf-8");
}

const main = async () => {
    const monthTracks = await getTopTracksForPeriod("1month");
    const monthAllTracks = await writeTracksToFile("month_tracks_data", monthTracks);

    const weekTracks = await getTopTracksForPeriod("7day");
    const weekAllTracks = await writeTracksToFile("week_tracks_data", weekTracks);

    await generateTopTags("month", monthAllTracks);
    await generateTopTags("week", weekAllTracks);
}

main();