import * as adminService from './admin.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function stats(_req, res) {
  return sendSuccess(res, 200, await adminService.getStats());
}

export async function listUsers(req, res) {
  const { items, meta } = await adminService.listUsers(req.validated.query);
  return sendSuccess(res, 200, items, meta);
}

export async function updateRole(req, res) {
  const result = await adminService.updateUserRole(req.validated.params.id, req.validated.body.role, req.user);
  return sendSuccess(res, 200, result);
}