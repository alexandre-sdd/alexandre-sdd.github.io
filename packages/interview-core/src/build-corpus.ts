import { writeGeneratedCorpus } from "./corpus.js";

const corpus = writeGeneratedCorpus();

console.log(`Generated ${corpus.chunkCount} interview corpus chunks.`);
