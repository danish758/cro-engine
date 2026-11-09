declare global {
  namespace Express {
    interface Request {
      user?: { id: number; name: string; email: string };
      projectId?: number;
      projectRole?: 'admin' | 'member';
    }
  }
}

export {};