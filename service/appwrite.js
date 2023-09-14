const sdk = require('node-appwrite');
const crypto = require('crypto');

require('dotenv').config();

let client = new sdk.Client();
client
    .setEndpoint(process.env.AW_ENDPOINT)
    .setProject(process.env.AW_PROJECT_ID)
    .setKey(process.env.AW_API_KEY);

const database = new sdk.Databases(client);

exports.getAllConsensus = async () => {
    try {
        const response = await database.listDocuments(process.env.AW_DATABASE_ID, process.env.AW_CONSENSUS_COLLECTION_ID)
        return response.documents;
    } catch (error) {
        console.log(error);
    }
}

exports.deleteAllConsensus = async () => {
    try {
        const response = await database.listDocuments(process.env.AW_DATABASE_ID, process.env.AW_CONSENSUS_COLLECTION_ID)
        response.documents.forEach(async (document) => {
            await database.deleteDocument(process.env.AW_DATABASE_ID, process.env.AW_CONSENSUS_COLLECTION_ID, document.$id);
        });
    } catch (error) {
        console.log(error);
    }
}

exports.createConsensus = async (id, timestamp, text) => {
    try {
        return await database.createDocument(process.env.AW_DATABASE_ID, process.env.AW_CONSENSUS_COLLECTION_ID, id, {
            timestamp: timestamp,
            text: text
        });
    } catch (error) {
        console.log(error);
    }
}

exports.createSubtext = async (id, parent_id, timestamp, selected, choices) => {
    try {
        return await database.createDocument(process.env.AW_DATABASE_ID, process.env.AW_SUBTEXT_COLLECTION_ID, id, {
            timestamp: timestamp,
            selected: selected,
            parent: parent_id,
            choices: choices
        });
    } catch (error) {
        console.log(error);
    }
}

exports.createOption = async (id, consensus_id, subtext_id, timestamp, text, new_consensus) => {
    try {
        await database.createDocument(process.env.AW_DATABASE_ID, process.env.AW_OPTION_COLLECTION_ID, id, {
            timestamp: timestamp,
            selected: text,
            subtext_id: subtext_id
        });

        await database.getDocument(process.env.AW_DATABASE_ID, process.env.AW_CONSENSUS_COLLECTION_ID, consensus_id).then(async (consensus) => {
            let timestamp = consensus.timestamp;
            await database.deleteDocument(process.env.AW_DATABASE_ID, process.env.AW_CONSENSUS_COLLECTION_ID, consensus_id).then(async () => {
                await database.createDocument(process.env.AW_DATABASE_ID, process.env.AW_CONSENSUS_COLLECTION_ID, consensus_id, {
                    timestamp: timestamp,
                    text: new_consensus
                });
            });
        });
    } catch (error) {
        console.log(error);
    }
}