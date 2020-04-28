/**
 * Highlight critical success or failure on d20 rolls
 */
export const highlightCriticalSuccessFailure = function(message, html, data) {
  if ( !message.roll || !message.roll.parts.length ) return;

  // Highlight rolls where the first part is a d20 roll
  let d = message.roll.parts[0];
  const isD20Roll = d instanceof Die && (d.faces === 20) && (d.results.length === 1);
  const isModifiedRoll = (d.rolls != null && "success" in d.rolls[0]) || (d.options != null && (d.options.marginSuccess || d.options.marginFailure));
  if ( isD20Roll && !isModifiedRoll ) {
    if (d.total >= (d.options.critical || 20)) html.find(".dice-total").addClass("success");
    else if (d.total <= (d.options.fumble || 1)) html.find(".dice-total").addClass("failure");
  }
};

/* -------------------------------------------- */

/**
 * Optionally hide the display of chat card action buttons which cannot be performed by the user
 */
export const displayChatActionButtons = function(message, html, data) {
  const chatCard = html.find(".pf1.chat-card");
  if (chatCard.length > 0) {

    // If the user is the message author or the actor owner, proceed
    const actor = game.actors.get(data.message.speaker.actor);
    if (actor && actor.owner) return;
    else if (game.user.isGM || (data.author.id === game.user.id)) return;

    // Otherwise conceal action buttons
    const buttons = chatCard.find("button[data-action]");
    buttons.each((a, btn) => {
      btn.style.display = "none"
    });
  }
};

/* -------------------------------------------- */

export const createCustomChatMessage = async function(chatTemplate, chatTemplateData={}, chatData={}) {
  let rollMode = game.settings.get("core", "rollMode");
  chatData = mergeObject({
    rollMode: rollMode,
    user: game.user._id,
    type: CONST.CHAT_MESSAGE_TYPES.CHAT,
    content: await renderTemplate(chatTemplate, chatTemplateData),
  }, chatData);
  // Handle different roll modes
  switch (chatData.rollMode) {
    case "gmroll":
      chatData["whisper"] = game.users.entities.filter(u => u.isGM).map(u => u._id);
      break;
    case "selfroll":
      chatData["whisper"] = [game.user._id];
      break;
    case "blindroll":
      chatData["whisper"] = game.users.entities.filter(u => u.isGM).map(u => u._id);
      chatData["blind"] = true;
      break;
  }

  ChatMessage.create(chatData);
};

export const hideRollInfo = function(app, html, data) {
  const whisper = app.data.whisper || [];
  const isBlind = whisper.length && app.data.blind;
  const isVisible = whisper.length ? (whisper.includes(game.user._id) || (app.isAuthor && !isBlind)) : true;
  if (!isVisible) {
    html.find(".dice-formula").text("???");
    html.find(".dice-total").text("?");
    html.find(".dice").text("");
    html.find(".success").removeClass("success");
    html.find(".failure").removeClass("failure");
  }
};
