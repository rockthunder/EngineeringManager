import type { SurveyResponse } from '../../domain/events/types';
import type { Campaign, Survey } from '../../domain/surveys/survey';

export interface SurveyStore {
  listSurveys(): Promise<Survey[]>;
  getSurvey(id: string): Promise<Survey | null>;
  saveSurvey(survey: Survey): Promise<void>;
  /** A survey is locked once any campaign using it has opened, so results stay comparable. */
  isLocked(surveyId: string): Promise<boolean>;

  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  /** Insert or update the campaign and its team list (keeps existing tokens for teams that stay). */
  saveCampaign(campaign: Campaign): Promise<void>;
  teamLinks(campaignId: string): Promise<{ teamId: string; token: string | null }[]>;
  setTokens(campaignId: string, tokens: Readonly<Record<string, string>>): Promise<void>;
  /** The campaign and team a link belongs to. */
  findByToken(token: string): Promise<{ campaignId: string; teamId: string } | null>;

  responses(campaignId: string): Promise<SurveyResponse[]>;
  addResponse(response: SurveyResponse): Promise<void>;
}
