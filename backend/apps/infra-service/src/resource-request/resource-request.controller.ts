import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ResourceRequestService } from './resource-request.service';
import {
  CreateResourceRequestDto,
  ReviewResourceRequestDto,
} from '@nest-msa/contracts';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Resource Requests (Dev vs Infra Workflow)')
@Controller('api/infra/requests')
export class ResourceRequestController {
  constructor(private readonly resourceRequestService: ResourceRequestService) {}

  @Get()
  @ApiOperation({ summary: 'List all resource requests with status filter' })
  getAllRequests(
    @Query('status') status?: string,
    @Query('requester') requester?: string,
  ) {
    return this.resourceRequestService.getAllRequests(status, requester);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get summary statistics of resource requests' })
  getStats() {
    return this.resourceRequestService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific resource request' })
  getRequestById(@Param('id') id: string) {
    return this.resourceRequestService.getRequestById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Submit a new resource request (by Dev Team)' })
  createRequest(@Body() dto: CreateResourceRequestDto) {
    return this.resourceRequestService.createRequest(dto);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'Review and approve/reject a resource request (by Infra Team)' })
  reviewRequest(
    @Param('id') id: string,
    @Body() dto: ReviewResourceRequestDto,
  ) {
    return this.resourceRequestService.reviewRequest(id, dto);
  }
}
