import { api } from "../lib/api";
import { CreateAccountDto, TikTokAccount, UpdateAccountDto, UpdateTaskDto, Task } from "../types/tikTokTypes";

const BASE_URL = "/accounts";

export const tikTokAccountService = {
  // Get all accounts
  getAllAccounts: async (): Promise<TikTokAccount[]> => {
    return api.get(BASE_URL);
  },

  // Get account by ID
  getAccountById: async (id: string): Promise<TikTokAccount> => {
    return api.get(`${BASE_URL}/${id}`);
  },

  // Create new account
  createAccount: async (data: CreateAccountDto): Promise<TikTokAccount> => {
    return api.post(BASE_URL, data as unknown as Record<string, unknown>);
  },

  // Update account
  updateAccount: async (id: string, data: UpdateAccountDto): Promise<TikTokAccount> => {
    return api.put(`${BASE_URL}/${id}`, data as unknown as Record<string, unknown>);
  },

  // Delete account
  deleteAccount: async (id: string): Promise<TikTokAccount> => {
    return api.delete(`${BASE_URL}/${id}`);
  },

  // Toggle account status
  toggleAccountStatus: async (id: string, status: boolean): Promise<TikTokAccount> => {
    return api.put(`${BASE_URL}/${id}`, { status } as Record<string, unknown>);
  },

  // Get account task
  getAccountTask: async (id: string): Promise<Task> => {
    return api.get(`${BASE_URL}/${id}/task`);
  },

  // Update account task
  updateAccountTask: async (id: string, data: UpdateTaskDto): Promise<TikTokAccount> => {
    return api.patch(`${BASE_URL}/${id}/task`, data as unknown as Record<string, unknown>);
  },

  // Run account task manually
  runAccountTask: async (id: string): Promise<TikTokAccount> => {
    return api.patch(`${BASE_URL}/${id}/task/run`, {} as Record<string, unknown>);
  }
}; 