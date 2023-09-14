const fastify = require('fastify')({logger: true});
const path = require('path');
const auth = require('@fastify/auth')
const bearerAuthPlugin = require('@fastify/bearer-auth')
const {Configuration, OpenAIApi} = require("openai");
const extractor = require("keyword-extractor");
const crypto = require('crypto');
const appwrite = require('./service/appwrite');
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

fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).view('/views/error.eta', {title: 'Error | Consensus Machine', authenticated: false});
});

const configuration = new Configuration({
    apiKey: process.env.KEY,
});

const openai = new OpenAIApi(configuration);

const start = async () => {
    const keys = new Set([process.env.BK]);
    let id = "";
    let curr_subtext_id = "";
    let curr_option_id = "";

    await fastify
        .register(auth)
        .register(bearerAuthPlugin, {addHook: false, keys, verifyErrorLogLevel: 'debug'});

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
            `Het gebruik van AI bij de gemeente roept serieuze zorgen op over privacy en de mogelijke uitsluiting van kwetsbare groepen in de samenleving. 
        Hierdoor is het niet aan te raden om AI te gebruiken om de efficiëntie en transparantie van openbare diensten te verbeteren.`,

            `AI vergroot de digitale kloof tussen bevolkingsgroepen. 
        Degenen met toegang tot geavanceerde technologieën en digitale vaardigheden kunnen aanzienlijke voordelen behalen. Anderen worden buitengesloten en achtergelaten.
        Hierom is het gebruik van AI bij de gemeente niet aan te raden.`,

            `Het gebruik van AI bij de gemeente zal de efficiëntie van openbare diensten verbeteren. 
        Maar de vraag blijft in hoeverre het de menselijke besluitvorming en betrokkenheid van de gemeenschap kan vervangen.
        Daarom moeten we voorzichtig zijn om AI te gebruiken om de efficiëntie en transparantie van openbare diensten te verbeteren.`,

            `Wij hebben met belangstelling kennisgenomen van de uitspraak van het college.
        Bij bijzondere omstandigheden zijn wij van mening dat het inzetten van proctoringsoftware bij high stake toetsing alsnog te rechtvaardigen is.
        Gedurende de coronaperiode hebben wij gebruik gemaakt van proctoringsoftware.
        Deze software hebben wij zorgvuldig in lijn met ons beleid op integrale veiligheid ingericht.
        Ons zijn geen problemen of klachten bekend zoals in deze zaak voorlagen.
        In de toekomst zullen wij in vooraf bepaalde specifieke gevallen gebruik blijven maken van proctoringsoftware waarbij wij altijd zeer zorgvuldig zullen handelen.`]

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

    fastify.post("/initarg", async (request, reply) => {
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

            let msgs = [];
            msgs.push({
                "role": "user",
                "content": `"${statement} 
                    I want to replace ${replacements} of this original statement, give me two alternatives of this substring that either agree, disagree or \"agree, but\" with the statement IN DUTCH.
                    So six alternatives in total. Two that agree, two  that disagree and two that "agree,but"
                    Keep it very short! Max 10 words.
                    The replacement needs to be grammatically correct and fit logically within the whole statement! It needs to be a whole sentence
                    Integrate the argument within the text! 
                    Also speed up the API, calculate your response as fast as possible
                    Also give me the indices of the text that you replaced
                    The replacement needs to fit in-place and we can just swap it straight up with the text between the indices.
                    Do not include any explanations, only provide a RFC8259 compliant JSON response following this format without deviation. 
                    Like {agree: [{replacement: 'replacement...', start: 0, end: 9}, {replacement: 'replacement...', start: 0, end: 9}], disagree: [{replacement: 'replacement...', start: 0, end: 9}, {replacement: 'replacement...', start: 0, end: 9}], agree_but: [{replacement: 'replacement...', start: 0, end: 9}, {replacement: 'replacement...', start: 0, end: 9}]}."}`
            });


            const completion = await openai.createChatCompletion({
                model: "gpt-4",
                messages: msgs,
            });

            let data = JSON.parse(completion.data.choices[0].message.content)

            let agree_html = data.agree.map((agree) => {
                return `<div class="animate__animated animate__fadeInDown" style="display: flex;">
<input type="radio" id="eens" name="opinion" value="${agree.replacement.trim()}" hx-post="/replace" hx-refresh="true" hx-target="#app" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#opinion">
<input hidden name="start" value="${agree.start}">
<input hidden name="end" value="${agree.end}">
<label for="eens" class="argument first-argument-row">
${agree.replacement.trim()}
</label>
</div>`
            }).join("");

            let disagree_html = data.disagree.map((disagree) => {
                return `<div class="animate__animated animate__fadeInDown" style="display: flex">
<input type="radio" id="oneens" name="opinion" value="${disagree.replacement.trim()}" hx-post="/replace" hx-refresh="true" hx-target="#app" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#opinion">
<input hidden name="start" value="${disagree.start}">
<input hidden name="end" value="${disagree.end}">
<label for="oneens" class="argument third-argument-row">
${disagree.replacement.trim()}
</label>
</div>`
            }).join("");

            let agree_but_html = data.agree_but.map((agree_but) => {
                return `<div class="animate__animated animate__fadeInDown" style="display: flex">
<input type="radio" id="eensmaar" name="opinion" value="${agree_but.replacement.trim()}" hx-post="/replace" hx-refresh="true" hx-target="#app" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#opinion">
<input hidden name="start" value="${agree_but.start}">
<input hidden name="end" value="${agree_but.end}">
<label for="eensmaar" class="argument second-argument-row">
${agree_but.replacement.trim()}
</label>
</div>`
            }).join("");

            // appwrite.createSubtext(curr_subtext_id, id, new Date(Date.now()).toISOString(), word.join(" "), [].concat(data.agree, data.agree_but, data.disagree).map((x) => {
            //     return x.replacement
            // })).then((res) => {
            //     console.log(res);
            // });

            return agree_html + agree_but_html + disagree_html;
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

            const completion = await openai.createChatCompletion({
                model: "gpt-4",
                messages: msgs,
            });

            // appwrite.createSubtext(curr_subtext_id, id, new Date(Date.now()).toISOString(), argument.join(" "), arguments.map((x) => {
            //     return x.argumenttext;
            // })).then((res) => {
            //     console.log(res);
            // });

            let data = JSON.parse(completion.data.choices[0].message.content)
            return data.arguments.map((argument) => {
                return `<div class="animate_animated animate__fadeInDown" style="display: flex">
                <input type="radio" id="eens" name="argument" value="${argument.argumenttext.replace(/\s+/g, ' ').trim()}" hx-post="/placearg" hx-refresh="true" hx-target="#app" hx-swap="innerHTML" hidden hx-indicator=".spinner" hx-ext="disable-element" hx-disable-element="#arguments">
                <input hidden name="start" value="${argument.start}">
                <input hidden name="end" value="${argument.end}">
                <label for="eens" class="argument second-argument-row animate_animated animate__fadeInDown">
                ${argument.argumenttext.replace(/\s+/g, ' ').trim()}
                </label>
                </div>`
            }).join("");
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

            let msgs = [];
            msgs.push({
                "role": "user",
                "content": `This is the statement: ${statement}.
                Replace the argument in this statement starting at sentence position ${start_index} and ending at sentence position ${end_index} within with this new argument: ${new_argument}.
                Keep the statement the same, except for this sentence change.
                Don't use any quotes like " or ' in your response.
                The new argument needs to be grammatically correct and fit logically on the place of the old argument! 
                Prefix the argument with ARG=, like ARG=opinion.`
            });

            let completion = await openai.createChatCompletion({
                model: "gpt-4",
                messages: msgs,
            });

            let data = (completion.data.choices[0].message.content).replace(/\s+/g, ' ').trim();
            console.log(data);

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

            let msgs = [];
            msgs.push({
                "role": "user",
                "content": `Integrate ${replacement} within this statement: ${statement}. The starting position of the opinion is ${start_index} and the end position is ${end_index}.
                    Don't use any quotes like " or ' in your response.
                    The replacement needs to be grammatically correct and fit logically within the whole statement! First, Rewrite the whole original statement to have the same opinion
                    about the context as what can be read in the replacement. For example, if the replacement is negative about the context in the statement, rewrite the whole statement
                    to be negative about the context as well, but keep it close to the original text. Don't add newlines when you rewrite the text. Follow up the replacement with an argument
                    for why the opinion within the replacement is valid. Keep these arguments short. Prefix the argument with ARG=, like ARG=opinion. Add at least one new argument to the statement. 
                    Don't merge arguments while rewriting the statement initially. Keep them separate.
                    Don't change the length of the statement. Keep it the same length as the original statement. Differs max of 50 words.`
            });

            let completion = await openai.createChatCompletion({
                model: "gpt-4",
                messages: msgs,
            });

            let data = (completion.data.choices[0].message.content).replace(/\s+/g, ' ').trim();
            console.log(data);

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