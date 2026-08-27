import * as authService from './auth.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function register(req, res) {
  const result = await authService.register(req.validated.body);
  return sendSuccess(res, 201, result);
}

export async function login(req, res) {
  const result = await authService.login(req.validated.body);
  return sendSuccess(res, 200, result);
}

export async function me(req, res) {
  return sendSuccess(res, 200, { user: req.user });
}