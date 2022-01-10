import { ActorPF } from "../entity.js";

export class ActorCharacterPF extends ActorPF {
  prepareBaseData() {
    super.prepareBaseData();

    const actorData = this.data.data;

    const maxExp = this.getLevelExp(actorData.details.level.value);
    actorData.details.xp.max = maxExp;

    if (!hasProperty(this.data, "data.details.level.value")) return;

    // Experience bar
    const prior = this.getLevelExp(actorData.details.level.value - 1 || 0),
      max = this.getLevelExp(actorData.details.level.value || 1);

    actorData.details.xp.pct =
      ((Math.max(prior, Math.min(max, actorData.details.xp.value)) - prior) / (max - prior)) * 100 || 0;
  }

  prepareSpecificDerivedData() {
    super.prepareSpecificDerivedData();
  }

  _updateExp(updateData) {
    // Get total level
    const classes = this.items.filter((o) => o.type === "class");
    const level = classes
      .filter((o) => o.data.data.classType !== "mythic")
      .reduce((cur, o) => cur + o.data.data.level, 0);

    if (updateData["data.details.xp.value"] == null) return;

    // Translate update exp value to number
    let newExp = updateData["data.details.xp.value"],
      resetExp = false;
    if (typeof newExp === "string") {
      const curExp =
        typeof this.data.data.details.xp.value === "number"
          ? this.data.data.details.xp.value
          : parseInt(this.data.data.details.xp.value);
      if (newExp.match(/^\+([0-9]+)$/)) {
        newExp = curExp + parseInt(RegExp.$1);
      } else if (newExp.match(/^-([0-9]+)$/)) {
        newExp = curExp - parseInt(RegExp.$1);
      } else if (newExp === "") {
        resetExp = true;
      } else if (newExp.match(/^([0-9]+)$/)) {
        newExp = parseInt(newExp);
      } else {
        newExp = curExp;
      }

      updateData["data.details.xp.value"] = newExp;
    }
    const maxExp = this.getLevelExp(level);
    updateData["data.details.xp.max"] = maxExp;

    if (resetExp) {
      const minExp = level > 0 ? this.getLevelExp(level - 1) : 0;
      updateData["data.details.xp.value"] = minExp;
    }
  }

  /**
   * Return the amount of experience required to gain a certain character level.
   *
   * @param level {number}  The desired level
   * @returns {number}       The XP required
   */
  getLevelExp(level) {
    const expConfig = game.settings.get("pf1", "experienceConfig");
    const expTrack = expConfig.track;
    // Preset experience tracks
    if (["fast", "medium", "slow"].includes(expTrack)) {
      const levels = CONFIG.PF1.CHARACTER_EXP_LEVELS[expTrack];
      return levels[Math.min(level, levels.length - 1)];
    }
    // Custom formula experience track
    let totalXP = 0;
    if (expConfig.custom.formula.length > 0) {
      for (let a = 0; a < level; a++) {
        const rollData = this.getRollData();
        rollData.level = a + 1;
        const roll = RollPF.safeRoll(expConfig.custom.formula, rollData);
        totalXP += roll.total;
      }
    }
    return Math.max(1, totalXP);
  }
}
