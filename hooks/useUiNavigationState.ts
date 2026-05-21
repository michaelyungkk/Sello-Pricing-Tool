import { useState } from 'react';
import type { AnalysisResult, AppView, NavigationIntent, Product, SearchSession } from '../types';

export const useUiNavigationState = () => {
    const [selectedElasticityProduct, setSelectedElasticityProduct] = useState<Product | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
    const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
    const [isSkuDetailModalOpen, setIsSkuDetailModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
    const [isCAUploadModalOpen, setIsCAUploadModalOpen] = useState(false);
    const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
    const [selectedAnalysisProduct, setSelectedAnalysisProduct] = useState<Product | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [searchSessions, setSearchSessions] = useState<SearchSession[]>([]);
    const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<AppView>('overview');
    const [navigationIntent, setNavigationIntent] = useState<NavigationIntent | null>(null);
    const [isFreshnessExpanded, setIsFreshnessExpanded] = useState(false);
    const [mapJumpState, setMapJumpState] = useState<{ carrier: string, metric: 'RETURN_RATE' | 'REVENUE' | 'PROFIT' | 'MARGIN' | 'TACOS' } | null>(null);

    return {
        selectedElasticityProduct,
        setSelectedElasticityProduct,
        isUploadModalOpen,
        setIsUploadModalOpen,
        isSalesImportModalOpen,
        setIsSalesImportModalOpen,
        isCostUploadModalOpen,
        setIsCostUploadModalOpen,
        isSkuDetailModalOpen,
        setIsSkuDetailModalOpen,
        isMappingModalOpen,
        setIsMappingModalOpen,
        isReturnsModalOpen,
        setIsReturnsModalOpen,
        isCAUploadModalOpen,
        setIsCAUploadModalOpen,
        isShipmentModalOpen,
        setIsShipmentModalOpen,
        selectedAnalysisProduct,
        setSelectedAnalysisProduct,
        analysisResult,
        setAnalysisResult,
        isAnalysisLoading,
        setIsAnalysisLoading,
        isSearchLoading,
        setIsSearchLoading,
        searchSessions,
        setSearchSessions,
        activeSearchId,
        setActiveSearchId,
        currentView,
        setCurrentView,
        navigationIntent,
        setNavigationIntent,
        isFreshnessExpanded,
        setIsFreshnessExpanded,
        mapJumpState,
        setMapJumpState
    };
};
