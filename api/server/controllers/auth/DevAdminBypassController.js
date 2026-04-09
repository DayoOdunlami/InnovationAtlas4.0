const { randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getAppConfig } = require('~/server/services/Config');
const { findUser, createUser, updateUser, getUserById } = require('~/models');

const DEFAULT_DEV_EMAIL = 'atlas-dev-bypass@local.dev';

/**
 * Development-only: signs in as a fixed admin user when body.password matches
 * DEV_ADMIN_BYPASS_PASSWORD. Route is not registered unless that env var is set.
 */
const devAdminBypassController = async (req, res) => {
  try {
    const secret = (process.env.DEV_ADMIN_BYPASS_PASSWORD || '').trim();
    if (!secret) {
      return res.status(404).json({ message: 'Not found' });
    }

    const provided = req.body?.password;
    if (typeof provided !== 'string' || provided !== secret) {
      return res.status(401).json({ message: 'Invalid dev password' });
    }

    const email = (process.env.DEV_ADMIN_BYPASS_EMAIL || DEFAULT_DEV_EMAIL).trim().toLowerCase();
    let userRecord = await findUser({ email });

    if (!userRecord) {
      const appConfig = await getAppConfig({ baseOnly: true });
      const salt = bcrypt.genSaltSync(10);
      const placeholderPassword = bcrypt.hashSync(randomBytes(32).toString('hex'), salt);
      const created = await createUser(
        {
          provider: 'local',
          email,
          username: 'atlas-dev-bypass',
          name: 'Atlas Dev Admin',
          avatar: null,
          role: SystemRoles.ADMIN,
          password: placeholderPassword,
          emailVerified: true,
        },
        appConfig.balance,
        true,
        true,
      );
      userRecord = await getUserById(created._id.toString());
    } else if (userRecord.role !== SystemRoles.ADMIN) {
      await updateUser(userRecord._id.toString(), { role: SystemRoles.ADMIN });
      userRecord = await getUserById(userRecord._id.toString());
    }

    if (!userRecord) {
      logger.error('[devAdminBypassController] User record missing after create/find');
      return res.status(500).json({ message: 'Something went wrong' });
    }

    if (userRecord.twoFactorEnabled) {
      return res.status(400).json({
        message: 'Dev bypass user has 2FA enabled; disable 2FA for that account or use normal login.',
      });
    }

    const token = await setAuthTokens(userRecord._id.toString(), res);
    const { password: _p, totpSecret: _t, __v, ...user } = userRecord;
    user.id = userRecord._id.toString();

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[devAdminBypassController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  devAdminBypassController,
};
