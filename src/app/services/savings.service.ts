import { Injectable } from '@angular/core';

const SAVINGS_STORAGE_KEY = 'cuan_savings_goals_v1';

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  createdAt: string;
  currency?: 'IDR' | 'USD' | 'EUR' | 'SGD' | 'JPY' | 'MYR';
  contributionFrequency?: 'daily' | 'weekly' | 'monthly';
  plannedContributionAmount?: number;
  achievedAt?: string;
  contributions?: SavingsContribution[];
}

export interface SavingsContribution {
  amount: number;
  contributedAt: string;
  action?: 'add' | 'subtract';
  note?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SavingsService {
  public getGoals(): SavingsGoal[] {
    const stored = localStorage.getItem(SAVINGS_STORAGE_KEY);
    if (!stored) return [];

    const goals: unknown = JSON.parse(stored);
    if (!Array.isArray(goals) || !goals.every(goal => this.isSavingsGoal(goal))) {
      throw new Error('Data celengan tersimpan tidak valid.');
    }

    return goals;
  }

  public createGoal(
    name: string,
    targetAmount: number,
    currency: SavingsGoal['currency'] = 'IDR',
    contributionFrequency: SavingsGoal['contributionFrequency'] = 'daily',
    plannedContributionAmount = 0
  ): SavingsGoal {
    const goal: SavingsGoal = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      name: name.trim(),
      targetAmount,
      savedAmount: 0,
      createdAt: new Date().toISOString(),
      currency,
      contributionFrequency,
      plannedContributionAmount,
      contributions: []
    };
    const goals = this.getGoals();
    goals.push(goal);
    this.saveGoals(goals);
    return goal;
  }

  public addContribution(
    goalId: string,
    amount: number,
    action: 'add' | 'subtract' = 'add',
    note = ''
  ): void {
    const goals = this.getGoals();
    const goal = goals.find(item => item.id === goalId);
    if (!goal) throw new Error('Celengan tidak ditemukan.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nominal harus lebih dari nol.');
    if (action === 'subtract' && amount > goal.savedAmount) {
      throw new Error('Pengurangan melebihi saldo tabungan.');
    }

    const previousSavedAmount = goal.savedAmount;
    goal.savedAmount += action === 'add' ? amount : -amount;
    const contributedAt = new Date().toISOString();
    goal.contributions = [...(goal.contributions || []), { amount, contributedAt, action, note: note.trim() }];
    if (previousSavedAmount < goal.targetAmount && goal.savedAmount >= goal.targetAmount) {
      goal.achievedAt = contributedAt;
    } else if (goal.savedAmount < goal.targetAmount) {
      goal.achievedAt = undefined;
    }
    this.saveGoals(goals);
  }

  public deleteGoal(goalId: string): void {
    this.saveGoals(this.getGoals().filter(goal => goal.id !== goalId));
  }

  public setGoals(goals: SavingsGoal[]): void {
    this.saveGoals(goals);
  }

  private saveGoals(goals: SavingsGoal[]): void {
    localStorage.setItem(SAVINGS_STORAGE_KEY, JSON.stringify(goals));
  }

  private isSavingsGoal(value: unknown): value is SavingsGoal {
    if (typeof value !== 'object' || value === null) return false;
    const goal = value as Partial<SavingsGoal>;
    return typeof goal.id === 'string' &&
      typeof goal.name === 'string' &&
      typeof goal.targetAmount === 'number' &&
      Number.isFinite(goal.targetAmount) &&
      typeof goal.savedAmount === 'number' &&
      Number.isFinite(goal.savedAmount) &&
      typeof goal.createdAt === 'string' &&
      (goal.currency === undefined || ['IDR', 'USD', 'EUR', 'SGD', 'JPY', 'MYR'].includes(goal.currency)) &&
      (goal.contributionFrequency === undefined || ['daily', 'weekly', 'monthly'].includes(goal.contributionFrequency)) &&
      (goal.plannedContributionAmount === undefined ||
        (typeof goal.plannedContributionAmount === 'number' && Number.isFinite(goal.plannedContributionAmount))) &&
      (goal.achievedAt === undefined || typeof goal.achievedAt === 'string') &&
      (goal.contributions === undefined ||
        (Array.isArray(goal.contributions) && goal.contributions.every(contribution =>
          typeof contribution === 'object' &&
          contribution !== null &&
          typeof contribution.amount === 'number' &&
          Number.isFinite(contribution.amount) &&
          typeof contribution.contributedAt === 'string' &&
          (contribution.action === undefined || ['add', 'subtract'].includes(contribution.action)) &&
          (contribution.note === undefined || typeof contribution.note === 'string')
        )));
  }
}
