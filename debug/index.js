// @ts-check

const slack_connector = require("@cagov/slack-connector");
const debugChannel = process.env["SLACKBOT_CHANNEL"]; //Or whatever channel you want

const slackToken = () => {
  const token = process.env["SLACKBOT_TOKEN"];

  if (!token) {
    //developers that don't set the creds can still use the rest of the code
    console.error(
      `You need local.settings.json to contain "SLACKBOT_TOKEN" to use slackbot features.`
    );
    return;
  }

  return token;
};

module.exports = async function () {
  let A = new slack_connector(slackToken(), debugChannel, {
    username: "Thread A user",
    icon_emoji: ":chart_with_upwards_trend:"
  });

  let B = new slack_connector(slackToken(), debugChannel, {
    username: "Thread B user"
  });

  try {
    await A.Chat("A");

    //throw new Error("Error Here");

    let toplevel = A.Clone();

    await B.Chat("B");

    const response = await A.Reply("A Reply 1");

    const r2Result = await A.Reply("A Reply 2");
    await B.Reply("B Reply 1");
    await B.ReactionAdd("thumbsup");

    await A.ReactionAdd("thumbsup");

    await toplevel.ReactionAdd("x");
  } catch (e) {
    A.Error(e, { customdata: "goes here" });
    throw e;
  }
};
