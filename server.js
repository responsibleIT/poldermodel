const fastify = require('fastify')({logger: true});
const path = require('path');
const auth = require('@fastify/auth')
const bearerAuthPlugin = require('@fastify/bearer-auth')
const {OpenAI} = require("openai");
const crypto = require('crypto');
const appwrite = require('./service/appwrite');
const worker = require('node:worker_threads');
require('dotenv').config();

fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/public',
})

fastify.register(require('@fastify/cookie'), {
    secret: [process.env.BLOOM, process.env.BLOOM2],
    hook: 'onRequest'
});

fastify.register(require('@fastify/view'), {
    engine: {
        eta: require("eta"),
    },
});

fastify.register(require('@fastify/formbody'));

fastify.register(require('@fastify/cors'));

fastify.register(require('@fastify/rate-limit'), {
    max: 1000,
    timeWindow: '1 minute'
});

fastify.register(require("fastify-socket.io"));

fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).view('/views/error.eta', {title: 'Error | Consensus Machine', authenticated: false});
});

const openai = new OpenAI({
    apiKey: process.env.KEY
});

const start = async () => {
    const keys = new Set([process.env.BK]);
    let id = "";
    let curr_subtext_id = "";
    let curr_option_id = "";

    await fastify
        .register(auth)
        .register(bearerAuthPlugin, {addHook: false, keys, verifyErrorLogLevel: 'fatal'});

    fastify.get('/', async (request, reply) => {
        reply.view('/views/consensus-index.eta', {
            title: 'Consensus Machine'
        });
    });

    fastify.get('/consensus', async (request, reply) => {
        const nonce = crypto.randomBytes(16).toString('base64');
        id = crypto.randomUUID();

        let statement_num = request.query.statement;

        let statements = [
            `
            AI-toepassingen worden grootschalig omarmd en ingezet; zonder dat men er weet van heeft wat AI eigenlijk wel of niet kan. 
            Regulering, zoals de AI act en de andere EU regelgeving, is een onderdeel van de aanpak, maar zal AI niet per se verantwoordelijk of waarachtig maken. 
            Een programma om AI te demystificeren en mensen digitaal weerbaar te maken is dus keihard nodig en urgent.
            `,

            `
            Ethiek in AI betekent het zeker stellen dat onze interactie met AI-systemen niet schadelijk is. Ook is het van belang dat AI bijdraagt aan vrede, menselijke waardigheid, duurzaamheid en veiligheid.
            `,

            `Het gebruik van AI bij de gemeente zal de efficiëntie van openbare diensten verbeteren. 
        Maar de vraag blijft in hoeverre het de menselijke besluitvorming en betrokkenheid van de gemeenschap kan vervangen.
        Daarom moeten we voorzichtig zijn om AI te gebruiken om de efficiëntie en transparantie van openbare diensten te verbeteren.`,]

        let statement = statements[statement_num];

        // appwrite.createConsensus(id, new Date(Date.now()).toISOString(), statement.replace(/\s+/g, ' ').trim()).then((consensus) => {
        //     console.log(consensus);
        // });
        reply
            .cookie('__sesh', nonce, {
                path: '/',
                httpOnly: true,
                secure: true,
                sameSite: true,
                signed: true,
            })
            .view('/views/consensus.eta', {
                title: 'Consensus Machine',
                bk: process.env.BK,
                host: process.env.ENDPOINT,
                statement: statement,
                statement_num: statement_num
            });
    });

    // fastify.get('/archive', async (request, reply) => {
    //     let allConsensus = await appwrite.getAllConsensus();
    //     allConsensus.sort(function (x, y) {
    //         return new Date(x.timestamp) < new Date(y.timestamp) ? 1 : -1
    //     })
    //
    //     reply.view('/views/archive.eta', {
    //         title: 'Archive | Consensus Machine',
    //         authenticated: false,
    //         allConsensus: allConsensus
    //     });
    // });

    const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

    fastify.post("/sent", async (request, reply) => {
        let cookie = request.cookies.__sesh;
        if (!cookie || !fastify.unsignCookie(cookie).valid) {
            reply.status(401).send({"message": "Unauthorized"});
        } else {

            let statement = request.body.statement.replace(/\s+/g, ' ').trim();
            curr_subtext_id = crypto.randomUUID();

            console.log(statement);

            let word = request.body.rep.match(/[a-zA-Z]+/g)
            let pos = request.body.rep.match(/\d+/g);
            let replacements = `${word.join(" ")} at sentence position ${pos}`

            console.log(replacements)

            let agree_msgs = [{
                "role": "user",
                "content": `"${statement} 
                    I want to replace ${replacements} of this original statement, give me two alternatives of this substring that either agree with the statement IN DUTCH.
                    So two alternatives in total. Two that agree"
                    It must be ONE complete sentence, maximum of 10 words.
                    Max 10 words.
                    Also give me the indices of the text that you replaced
                    Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation. 
                    Like {agree: [{replacement: 'replacement...', start: 0, end: 9}, {replacement: 'replacement...', start: 0, end: 9}]}."}`
            }];

            let disagree_msgs = [{
                "role": "user",
                "content": `"${statement} 
                    I want to replace ${replacements} of this original statement, give me two alternatives of this substring that either disagree with the statement IN DUTCH.
                    So two alternatives in total. Two that disagree"
                    It must be ONE complete sentence, maximum of 10 words.
                    Max 10 words.
                    Also give me the indices of the text that you replaced
                    Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation. 
                    Like {disagree: [{replacement: 'replacement...', start: 0, end: 9}, {replacement: 'replacement...', start: 0, end: 9}]}."}`
            }];

            let but_msgs = [{
                "role": "user",
                "content": `"${statement} 
                    I want to replace ${replacements} of this original statement, give me two alternatives of this substring that either "agree but" with the statement IN DUTCH.
                    So two alternatives in total. Two that "agree but"
                    It must be ONE complete sentence, maximum of 10 words.
                    Max 10 words.
                    Also give me the indices of the text that you replaced
                    Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation. 
                    Like {agree_but: [{replacement: 'replacement...', start: 0, end: 9}, {replacement: 'replacement...', start: 0, end: 9}]}."}`
            }];

            const promises = [
                openai.chat.completions.create({
                    model: "gpt-4",
                    messages: agree_msgs
                }),
                openai.chat.completions.create({
                    model: "gpt-4",
                    messages: disagree_msgs
                }),
                openai.chat.completions.create({
                    model: "gpt-4",
                    messages: but_msgs
                }),
            ];

            const completions = await Promise.all(promises);

            const agree_data = JSON.parse(completions[0].choices[0].message.content);
            const disagree_data = JSON.parse(completions[1].choices[0].message.content);
            const but_data = JSON.parse(completions[2].choices[0].message.content);

            let agree_html = agree_data.agree.map((agree, index) => {
                return `<div id="agree${index}" class="animate__animated animate__zoomIn" style="display: flex;">
<input type="radio" id="eens${index}" name="opinion" value="${agree.replacement.trim()}" hx-post="/replace" hx-refresh="true" hx-target="body" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#opinion">
<input hidden name="start" value="${agree.start}">
<input hidden name="end" value="${agree.end}">
<label for="eens${index}" class="argument first-argument-row">
${agree.replacement.trim()}
</label>
</div>`
            }).join("");

            let disagree_html = disagree_data.disagree.map((disagree, index) => {
                return `<div id="disagree${index}"class="animate__animated animate__zoomIn" style="display: flex">
<input type="radio" id="oneens${index}" name="opinion" value="${disagree.replacement.trim()}" hx-post="/replace" hx-refresh="true" hx-target="body" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#opinion">
<input hidden name="start" value="${disagree.start}">
<input hidden name="end" value="${disagree.end}">
<label for="oneens${index}" class="argument third-argument-row">
${disagree.replacement.trim()}
</label>
</div>`
            }).join("");

            let agree_but_html = but_data.agree_but.map((agree_but, index) => {
                return `<div id="but${index}" class="animate__animated animate__zoomIn" style="display: flex">
<input type="radio" id="eensmaar${index}" name="opinion" value="${agree_but.replacement.trim()}" hx-post="/replace" hx-refresh="true" hx-target="body" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#opinion">
<input hidden name="start" value="${agree_but.start}">
<input hidden name="end" value="${agree_but.end}">
<label for="eensmaar${index}" class="argument second-argument-row">
${agree_but.replacement.trim()}
</label>
</div>`
            }).join("");

            // appwrite.createSubtext(curr_subtext_id, id, new Date(Date.now()).toISOString(), word.join(" "), [].concat(data.agree, data.agree_but, data.disagree).map((x) => {
            //     return x.replacement
            // })).then((res) => {
            //     console.log(res);
            // });

            return agree_html +
                agree_but_html +
                disagree_html +
                `
                <script>
                    document.getElementById("agree0").onclick = () => {
                        document.getElementById("agree0").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("agree1").onclick = () => {
                        document.getElementById("agree1").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("disagree0").onclick = () => {
                        document.getElementById("disagree0").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("disagree1").onclick = () => {
                        document.getElementById("disagree1").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("but0").onclick = () => {
                        document.getElementById("but0").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("but1").onclick = () => {
                        document.getElementById("but1").style.filter = "saturate(2)"
                    }
                </script>
                `;
        }
    });

    fastify.post("/altarg", async (request, reply) => {
        let cookie = request.cookies.__sesh;
        if (!cookie || !fastify.unsignCookie(cookie).valid) {
            reply.status(401).send({"message": "Unauthorized"});
        } else {
            let statement = request.body.statement.replace(/\s+/g, ' ').trim();
            curr_subtext_id = crypto.randomUUID();

            let argument = request.body.arg.match(/[a-zA-Z]+/g)
            let pos = request.body.arg.match(/\d+/g);
            let argumentsentence = `${argument.join(" ")} at sentence position ${pos}`

            console.log(argumentsentence)

            let msgs = [];
            msgs.push({
                "role": "user",
                "content": `"${statement} 
                    I want to replace ${argumentsentence} of this original statement, give me six other arguments that support the sentence in front of this argument.
                    Keep it very short! Max 10 words.
                    The replacement needs to be grammatically correct and fit logically within the whole statement! It needs to be a whole sentence
                    Integrate the argument within the text! 
                    Also give me the indices of the text that you replaced.
                    The replacement-argument needs to fit in-place and we can just swap it straight up with the text between the indices.
                    Make sure the six newly suggested arguments are based on the educationvalues: rechtvaardigheid (gelijke kansen, inclusiviteit, integriteit), 
                    menselijkheid (sociale samenhang, respect, veiligheid, welzijn), 
                    autonomie (zelfbeschikking, privacy, onafhankelijkheid, vrijheid).
                    Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation. 
                    Like {arguments: [{argumenttext: 'argument', start: 0, end: 9}, {argumenttext: 'argument', start: 0, end: 9}, {argumenttext: 'argument', start: 0, end: 9}, {argumenttext: 'argument', start: 0, end: 9}, {argumenttext: 'argument', start: 0, end: 9}, {argumenttext: 'argument', start: 0, end: 9}]}`
            });

            const completion = await openai.chat.completions.create({
                model: "gpt-4",
                messages: msgs,
            });

            // appwrite.createSubtext(curr_subtext_id, id, new Date(Date.now()).toISOString(), argument.join(" "), arguments.map((x) => {
            //     return x.argumenttext;
            // })).then((res) => {
            //     console.log(res);
            // });

            let data = JSON.parse(completion.choices[0].message.content)
            return data.arguments.map((argument, index) => {
                return `<div id="arg${index}" class="animate__animated animate__zoomIn" style="display: flex">
                <input type="radio" id="ment${index}" name="argument" value="${argument.argumenttext.replace(/\s+/g, ' ').trim()}" hx-post="/placearg" hx-refresh="true" hx-target="body" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#arguments">
                <input hidden name="start" value="${argument.start}">
                <input hidden name="end" value="${argument.end}">
                <label for="ment${index}" class="argument second-argument-row animate_animated animate__fadeInDown">
                ${argument.argumenttext.replace(/\s+/g, ' ').trim()}
                </label>
                </div>`
            }).join("") +
                `
                <script>
                    document.getElementById("arg0").onclick = () => {
                        document.getElementById("arg0").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("arg1").onclick = () => {
                        document.getElementById("arg1").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("arg2").onclick = () => {
                        document.getElementById("arg2").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("arg3").onclick = () => {
                        document.getElementById("arg3").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("arg4").onclick = () => {
                        document.getElementById("arg4").style.filter = "saturate(2)"
                    }
                    
                    document.getElementById("arg5").onclick = () => {
                        document.getElementById("arg5").style.filter = "saturate(2)"
                    }
                `;
        }
    });

    fastify.post("/placearg", async (request, reply) => {
        let cookie = request.cookies.__sesh;
        if (!cookie || !fastify.unsignCookie(cookie).valid) {
            reply.status(401).send({"message": "Unauthorized"});
        } else {
            let start_index = request.body.start[0];
            let end_index = request.body.end[0];
            let new_argument = request.body.argument;
            let statement = request.body.statement.replace(/\s+/g, ' ').trim();

            curr_option_id = crypto.randomUUID();

            let msg = {
                "role": "user",
                "content": `This is the statement: ${statement}.
                Replace the argument in this statement starting at sentence position ${start_index} and ending at sentence position ${end_index} within with this new argument: ${new_argument}.
                Keep the statement the same length as the original statement. Differs max of 50 words. It has to be as close to the original statement as possible.
                Don't use any quotes like " or ' in your response.
                The new argument needs to be grammatically correct and fit logically on the place of the old argument! 
                Prefix the argument with ARG=, like ARG=opinion.`
            }

            let data = await stream(msg);

            // appwrite.createOption(curr_option_id, id, curr_subtext_id, new Date(Date.now()).toISOString(), new_argument, data).then((res) => {
            //     console.log(res);
            // });

            reply
                .view('/views/consensus.eta', {
                    title: 'Consensus Machine',
                    bk: process.env.BK,
                    host: process.env.ENDPOINT,
                    statement: data
                });
        }
    });

    async function stream(msg) {
        let completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [msg],
            stream: true
        });
        let whole = ""
        let show_whole = ""
        for await (const part of completion) {
            let output = (part.choices[0]?.delta?.content || '')
            if (output.includes(":")){
                continue;
            }

            whole += output
            if (output.includes("ARG=")) {
                show_whole += output.replaceAll(/ARG=/g, "")
            }else {
                show_whole += output
            }

            show_whole = show_whole.replaceAll(/ARG=/g, "")
            fastify.io.emit('part', show_whole);
        }

        fastify.io.emit('part', "DONE");

        await sleep(1000)

        return whole
    }

    fastify.post("/replace", async (request, reply) => {
        let cookie = request.cookies.__sesh;
        if (!cookie || !fastify.unsignCookie(cookie).valid) {
            reply.status(401).send({"message": "Unauthorized"});
        } else {
            let start_index = request.body.start[0];
            let end_index = request.body.end[0];
            let replacement = request.body.opinion;
            let statement = request.body.statement.replace(/\s+/g, ' ').trim();

            curr_option_id = crypto.randomUUID();

            let msg = {
                "role": "user",
                "content": `Integrate ${replacement} within this statement: ${statement}. The starting position of the opinion is ${start_index} and the end position is ${end_index}.
                    Integrate the provided replacement seamlessly into the original statement, ensuring it works as a standalone argument.
                    Maintain the tone (positive or negative) of the replacement if it differs from the original statement's tone.
                    Retain the overall idea of the other arguments in the text.
                    Do not introduce new details or specifics not present in the original statement.
                    Keep the statement's length within the same range as the original, with a maximum difference of 50 words.
                    Avoid adding new lines when rewriting; transition smoothly from the replacement to a new argument.
                    You may add one new argument to the statement, prefix the argument with ARG=, like ARG=opinion.
                    Do not merge existing arguments initially
                    `
            }

            let data = await stream(msg);

            // appwrite.createOption(curr_option_id, id, curr_subtext_id, new Date(Date.now()).toISOString(), replacement, data).then((res) => {
            //     console.log(res);
            // });

            reply
                .view('/views/consensus.eta', {
                    title: 'Consensus Machine',
                    bk: process.env.BK,
                    host: process.env.ENDPOINT,
                    statement: data
                });
        }
    });

    try {
        await fastify.listen({host: "0.0.0.0", port: process.env.PORT || 3000})
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}

start()