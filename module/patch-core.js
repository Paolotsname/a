import { _rollInitiative, _getInitiativeFormula } from "./combat.js";
import { _preProcessDiceFormula } from "./dice.js";
import "./misc/vision-permission.js";
import { ActorPF } from "./actor/entity.js";
import { updateChanges } from "./actor/update-changes.js";

const FormApplication_close = FormApplication.prototype.close;

export async function PatchCore() {
  // Patch getTemplate to prevent unwanted indentation in things things like <textarea> elements.
  async function PF1_getTemplate(path) {
    if ( !_templateCache.hasOwnProperty(path) ) {
      await new Promise(resolve => {
        game.socket.emit('template', path, resp => {
          const compiled = Handlebars.compile(resp.html, { preventIndent: true });
          Handlebars.registerPartial(path, compiled);
          _templateCache[path] = compiled;
          console.log(`Foundry VTT | Retrieved and compiled template ${path}`);
          resolve(compiled);
        });
      });
    } 
    return _templateCache[path];
  }

  // Patch TokenHUD.getData to show resource bars even if their value is 0
  const TokenHUD_getData = TokenHUD.prototype.getData;
  TokenHUD.prototype.getData = function() {
    const data = TokenHUD_getData.call(this);
    const bar1 = this.object.getBarAttribute("bar1");
    const bar2 = this.object.getBarAttribute("bar2");
    return mergeObject(data, {
      displayBar1: bar1 != null && bar1.attribute != null && bar1.value != null,
      displayBar2: bar2 != null && bar2.attribute != null && bar2.value != null
    });
  }

  const Roll__identifyTerms = Roll.prototype._identifyTerms;
  Roll.prototype._identifyTerms = function(formula) {
    formula = _preProcessDiceFormula(formula, this.data);
    const terms = Roll__identifyTerms.call(this, formula);
    return terms;
  };

  //Remove after 0.7.7
  if (isMinimumCoreVersion("0.7.6")) {
  const Roll__splitDiceTerms = Roll.prototype._splitDiceTerms;
  Roll.prototype._splitDiceTerms = function(formula) {

    // Split on arithmetic terms and operators
    const operators = this.constructor.ARITHMETIC.concat(["(", ")"]);
    const arith = new RegExp(operators.map(o => "\\"+o).join("|"), "g");
    const split = formula.replace(arith, ";$&;").split(";");

    // Strip whitespace-only terms
    let terms = split.reduce((arr, term) => {
      term = term.trim();
      if ( term === "" ) return arr;
      arr.push(term);
      return arr;
    }, []);

    // Categorize remaining non-whitespace terms
    terms = terms.reduce((arr, term, i, split) => {

      // Arithmetic terms
      if ( this.constructor.ARITHMETIC.includes(term) ) {
        if ( (term !== "-" && !arr.length) || (i === (split.length - 1)) ) return arr; // Ignore leading or trailing arithmetic
        arr.push(term);
      }

      // Numeric terms
      else if ( Number.isNumeric(term) ) arr.push(Number(term));

      // Dice terms
      else {
        const die = DiceTerm.fromExpression(term);
        arr.push(die || term);
      }
      return arr;
    }, []);
    return terms;
  };
  }
  
  
  // Patch ActorTokenHelpers.update
  const ActorTokenHelpers_update = ActorTokenHelpers.prototype.update;
  ActorTokenHelpers.prototype.update = async function(data, options={}) {

    // Avoid regular update flow for explicitly non-recursive update calls
    if (getProperty(options, "recursive") === false) {
      return ActorTokenHelpers_update.call(this, data, options);
    }

    // Pre update
    if (isMinimumCoreVersion("0.7.4")) {
      data = this.preUpdate(data);
    }

    // Update changes
    let diff = data;
    if (options.updateChanges !== false) {
      const updateObj = await updateChanges.call(this, { data: data });
      if (updateObj.diff.items) delete updateObj.diff.items;
      diff = mergeObject(diff, updateObj.diff);
    }

    if (Object.keys(diff).length) {
      await ActorTokenHelpers_update.call(this, diff, mergeObject(options, { recursive: true }));
    }
    const promises = [];
    if (this.sheet) promises.push(this.sheet.render());
    promises.push(this.toggleConditionStatusIcons());
    await Promise.all(promises);
  };
  // Patch ActorTokenHelpers.updateEmbeddedEntity
  const ActorTokenHelpers_updateEmbeddedEntity = ActorTokenHelpers.prototype.updateEmbeddedEntity;
  ActorTokenHelpers.prototype.updateEmbeddedEntity = async function(embeddedName, data, options={}) {
    const itemData = duplicate(this.items.find(o => o._id === data._id)?.data);

    await ActorTokenHelpers_updateEmbeddedEntity.call(this, embeddedName, data, options);

    // Update token buff effect images
    if (itemData) {
      let promises = [];
      const isActive = itemData.data.active || data["data.active"];

      if (itemData.type === "buff" && isActive && data["img"]) {
        const tokens = this.getActiveTokens();
        for (const token of tokens) {
          const fx = token.data.effects || [];
          if (fx.indexOf(itemData.img) !== -1) fx.splice(fx.indexOf(itemData.img), 1);
          if (fx.indexOf(data["img"]) === -1) fx.push(data["img"]);
          promises.push(token.update({effects: fx}, {diff: false}));
        }
      }

      await Promise.all(promises);
    }

    return ActorPF.prototype.update.call(this, {});
  };
  // Patch ActorTokenHelpers.deleteEmbeddedEntity
  const ActorTokenHelpers_deleteEmbeddedEntity = ActorTokenHelpers.prototype.deleteEmbeddedEntity;
  ActorTokenHelpers.prototype.deleteEmbeddedEntity = async function(embeddedName, id, options={}) {
    const item = this.items.find(o => o._id === id);

    await ActorTokenHelpers_deleteEmbeddedEntity.call(this, embeddedName, id, options);

    // Remove token effects for deleted buff
    if (item) {
      let promises = [];
      if (item.type === "buff" && item.data.data.active) {
        const tokens = this.getActiveTokens();
        for (const token of tokens) {
          promises.push(token.toggleEffect(item.data.img));
        }
      }
      await Promise.all(promises);
    }

    return ActorPF.prototype.update.call(this, {});
  };

  // Patch, patch, patch
  Combat.prototype._getInitiativeFormula = _getInitiativeFormula;
  Combat.prototype.rollInitiative = _rollInitiative;
  window.getTemplate = PF1_getTemplate;

  // Import low-light vision code
  if (isMinimumCoreVersion("0.7.2")) {
    await import("./low-light-vision.js");
  }
  else {
    await import("./low-light-vision-0.6.6.js");
  }
}

import { isMinimumCoreVersion } from "./lib.js";
import "./measure.js";
